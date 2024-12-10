"use strict";
require("dotenv/config");
const { PrismaClient } = require("@prisma/client");
const { getAccessToken } = require("./auth");
const { getCustomerId } = require("./utils");
const { BatchResponseSimplePublicObjectStatusEnum } = require("@hubspot/api-client/lib/codegen/crm/contacts");
const { hubspotClient, prisma } = require("./clients");

const customerId = getCustomerId();
const MAX_BATCH_SIZE = 100;

const splitBatchByMaxBatchSize = (contacts, start) => contacts.splice(start, MAX_BATCH_SIZE);

class BatchToBeSynced {
    constructor(startingContacts, hubspotClient) {
        this.startingContacts = startingContacts;
        this.hubspotClient = hubspotClient;
        this.cohortSize = startingContacts.length;
        this.nativeIdsToRemoveFromBatchBeforeCreateAttempt = [];
        this.mapOfEmailsToNativeIds = new Map();
        this._batchReadInputs = {
            properties: [''],
            propertiesWithHistory: [''],
            inputs: []
        };
        this._batchReadOutput = {
            status: BatchResponseSimplePublicObjectStatusEnum.Pending,
            results: [],
            startedAt: new Date(),
            completedAt: new Date()
        };
        this._batchCreateOutput = {
            status: BatchResponseSimplePublicObjectStatusEnum.Pending,
            results: [],
            startedAt: new Date(),
            completedAt: new Date()
        };
        this._batchReadError = null;
        this._syncErrors = null;
        this._saveErrors = null;

        if (!this.isLessThanMaxBatchSize()) {
            throw new Error(`Batch is too big, please supply less than ${MAX_BATCH_SIZE}`);
        }
        this.createMapOfEmailsToNativeIds();
        this.readyBatchForBatchRead();
    }

    isLessThanMaxBatchSize() {
        return this.startingContacts.length <= MAX_BATCH_SIZE;
    }

    createMapOfEmailsToNativeIds() {
        for (const contact of this.startingContacts) {
            if (contact.email) {
                this.mapOfEmailsToNativeIds.set(contact.email, contact.id);
            }
        }
    }

    readyBatchForBatchRead() {
        const inputsWithEmails = this.startingContacts.filter(contact => contact.email);
        const idsToRead = inputsWithEmails.map(contact => ({ id: contact.email }));
        this._batchReadInputs = {
            inputs: idsToRead,
            idProperty: 'email',
            properties: ['email', 'firstname', 'lastname'],
            propertiesWithHistory: []
        };
    }

    async batchRead() {
        const accessToken = await getAccessToken(customerId);
        this.hubspotClient.setAccessToken(accessToken);
        try {
            const response = await this.hubspotClient.crm.contacts.batchApi.read(this._batchReadInputs);
            this._batchReadOutput = response;
        } catch (error) {
            this._batchReadError = error;
        }
    }

    removeKnownContactsFromBatch() {
        const emailsOfKnownContacts = this._batchReadOutput.results.map(knownContact => knownContact.properties.email || '');
        for (const email of emailsOfKnownContacts) {
            this.mapOfEmailsToNativeIds.delete(email);
        }
    }

    async sendNetNewContactsToHubspot() {
        const contactsToSendToHubSpot = [];
        this.mapOfEmailsToNativeIds.forEach((nativeId, emailAddress) => {
            const matchedContact = this.startingContacts.find(contact => contact.email === emailAddress);
            if (!matchedContact) return;

            const propertiesToSend = ['email', 'firstname', 'lastname'];
            const createPropertiesSection = (contact, propertiesToSend) => {
                const propertiesSection = {};
                for (const property of propertiesToSend) {
                    if (contact[property]) propertiesSection[property] = contact[property];
                }
                return propertiesSection;
            };

            const nonNullPropertiesToSend = createPropertiesSection(matchedContact, propertiesToSend);
            const formattedContact = {
                associations: [],
                properties: nonNullPropertiesToSend
            };
            contactsToSendToHubSpot.push(formattedContact);
        });

        try {
            const response = await this.hubspotClient.crm.contacts.batchApi.create({ inputs: contactsToSendToHubSpot });
            if (response instanceof BatchResponseSimplePublicObjectWithErrors && response.errors) {
                this._syncErrors = this._syncErrors ? this._syncErrors.concat(response.errors) : response.errors;
            }
            this._batchCreateOutput = response;
            return response;
        } catch (error) {
            this._saveErrors = this._saveErrors ? this._saveErrors.concat(error) : [error];
        }
    }

    async saveHSContactIDToDatabase() {
        const savedContacts = this._batchCreateOutput.results.length ? this._batchCreateOutput.results : this._batchReadOutput.results;
        for (const contact of savedContacts) {
            try {
                if (!contact.properties.email) throw new Error('Need an email address to save contacts');
                await prisma.contacts.update({
                    where: { email: contact.properties.email },
                    data: { hs_object_id: contact.id }
                });
            } catch (error) {
                throw new Error('Encountered an issue saving a record to the database');
            }
        }
    }

    get syncErrors() {
        return this._syncErrors;
    }

    get saveErrors() {
        return this._saveErrors;
    }

    get syncResults() {
        return this._batchCreateOutput;
    }
}

const syncContactsToHubSpot = async () => {
    const prisma = new PrismaClient();
    const localContacts = await prisma.contacts.findMany({ where: { hs_object_id: null } });
    const syncJob = await prisma.syncJobs.create({ data: { executionTime: new Date() } });
    let start = 0;
    let finalResults = [];
    let finalErrors = [];
    const syncJobId = syncJob.id;

    console.log(`===== Starting Sync Job for ${localContacts.length} contacts =====`);
    while (localContacts.length > 0) {
        const batch = splitBatchByMaxBatchSize(localContacts, start);
        const syncCohort = new BatchToBeSynced(batch, hubspotClient);
        await syncCohort.batchRead();
        syncCohort.removeKnownContactsFromBatch();

        if (syncCohort.mapOfEmailsToNativeIds.size === 0) {
            console.log('All contacts were known, no need to create');
        } else {
            await syncCohort.sendNetNewContactsToHubspot();
            if (syncCohort.syncErrors) finalErrors.push(syncCohort.syncErrors);
            finalResults.push(syncCohort.syncResults);
            console.log(`===== Finished current cohort, still have ${localContacts.length} contacts to sync =====`);
        }
        await syncCohort.saveHSContactIDToDatabase();
    }

    await prisma.syncJobs.update({
        where: { id: syncJobId },
        data: { success: JSON.stringify(finalResults), failures: JSON.stringify(finalErrors) }
    });

    console.log(`==== Batch sync complete, this job produced ${finalResults.length} successes and ${finalErrors.length} errors, check the syncJobs table for full results ====`);
    return { results: { success: finalResults, errors: finalErrors } };
};

module.exports = { syncContactsToHubSpot };
