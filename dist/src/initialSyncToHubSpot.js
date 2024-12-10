"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncContactsToHubSpot = void 0;
require("dotenv/config");
const client_1 = require("@prisma/client");
const auth_1 = require("./auth");
const utils_1 = require("./utils");
const contacts_1 = require("@hubspot/api-client/lib/codegen/crm/contacts");
const clients_1 = require("./clients");
const customerId = (0, utils_1.getCustomerId)();
const MAX_BATCH_SIZE = 100;
const splitBatchByMaxBatchSize = (contacts, start) => {
    return contacts.splice(start, MAX_BATCH_SIZE);
};
class BatchToBeSynced {
    startingContacts = [];
    cohortSize = 0;
    nativeIdsToRemoveFromBatchBeforeCreateAttempt = [];
    mapOfEmailsToNativeIds = new Map(); // might want to make this a private property
    #batchReadInputs = {
        properties: [''],
        propertiesWithHistory: [''],
        inputs: []
    };
    #batchReadOutput = {
        status: contacts_1.BatchResponseSimplePublicObjectStatusEnum.Pending,
        results: [],
        startedAt: new Date(),
        completedAt: new Date()
    };
    #batchCreateOutput = {
        status: contacts_1.BatchResponseSimplePublicObjectStatusEnum.Pending,
        results: [],
        startedAt: new Date(),
        completedAt: new Date()
    };
    #batchReadError = null;
    #syncErrors = null;
    #saveErrors = null;
    hubspotClient;
    constructor(startingContacts, hubspotClient) {
        this.hubspotClient = hubspotClient;
        this.startingContacts = startingContacts;
        this.cohortSize = this.startingContacts.length;
        if (!this.isLessThanMaxBatchSize()) {
            throw new Error(`Batch is too big, please supply less than ${MAX_BATCH_SIZE} `);
        }
        this.createMapOfEmailsToNativeIds();
        this.readyBatchForBatchRead();
    }
    isLessThanMaxBatchSize() {
        return this.startingContacts.length <= MAX_BATCH_SIZE;
    }
    createMapOfEmailsToNativeIds() {
        // Use for of loop to impreove readability
        for (let i = 0; i < this.startingContacts.length; i++) {
            const contact = this.startingContacts[i];
            if (contact.email) {
                this.mapOfEmailsToNativeIds.set(contact.email, contact.id);
                // ignore contacts without email addresses for now
            }
        }
    }
    readyBatchForBatchRead() {
        // Filter out contacts that don't have an email address
        // Consider making this a private method, no real reason for it to be exposed
        const inputsWithEmails = this.startingContacts.filter((contact) => !!contact.email);
        const idsToRead = inputsWithEmails.map((contact) => {
            return { id: contact.email };
        });
        this.#batchReadInputs = {
            inputs: idsToRead,
            idProperty: 'email',
            properties: ['email', 'firstname', 'lastname'],
            propertiesWithHistory: []
        };
    }
    async batchRead() {
        const accessToken = await (0, auth_1.getAccessToken)(customerId);
        this.hubspotClient.setAccessToken(accessToken);
        try {
            const response = await this.hubspotClient.crm.contacts.batchApi.read(this.#batchReadInputs);
            this.#batchReadOutput = response;
        }
        catch (error) {
            if (error instanceof Error) {
                this.#batchReadError = error;
            }
        }
    }
    removeKnownContactsFromBatch() {
        const emailsOfKnownContacts = this.#batchReadOutput.results.map((knownContact) => {
            return knownContact.properties.email
                ? knownContact.properties.email
                : '';
        });
        for (const email of emailsOfKnownContacts) {
            this.mapOfEmailsToNativeIds.delete(email);
        }
    }
    async sendNetNewContactsToHubspot() {
        const contactsToSendToHubSpot = [];
        this.mapOfEmailsToNativeIds.forEach((nativeId, emailAddress) => {
            const matchedContact = this.startingContacts.find((startingContact) => startingContact.email == emailAddress);
            const propertiesToSend = ['email', 'firstname', 'lastname']; // Make this a DB call to mapped Properties when combined with property mapping use case
            if (!matchedContact) {
                return false;
            }
            const createPropertiesSection = (contact, propertiesToSend) => {
                const propertiesSection = {};
                for (const property of propertiesToSend) {
                    contact[property]
                        ? (propertiesSection[property] = contact[property])
                        : null;
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
            const response = await this.hubspotClient.crm.contacts.batchApi.create({
                inputs: contactsToSendToHubSpot
            });
            if (response instanceof contacts_1.BatchResponseSimplePublicObjectWithErrors &&
                response.errors) {
                if (Array.isArray(this.#syncErrors)) {
                    this.#syncErrors.concat(response.errors);
                }
                else {
                    this.#syncErrors = response.errors;
                }
            }
            this.#batchCreateOutput = response;
            return response;
        }
        catch (error) {
            if (error instanceof Error) {
                if (this.#saveErrors) {
                    this.#saveErrors.push(error);
                }
                else {
                    this.#saveErrors = [error];
                }
            }
        }
    }
    async saveHSContactIDToDatabase() {
        const savedContacts = this.#batchCreateOutput.results.length
            ? this.#batchCreateOutput.results
            : this.#batchReadOutput.results;
        for (const contact of savedContacts) {
            try {
                if (!contact.properties.email) {
                    throw new Error('Need an email address to save contacts');
                }
                await clients_1.prisma.contacts.update({
                    where: {
                        email: contact.properties.email
                    },
                    data: {
                        hs_object_id: contact.id
                    }
                });
            }
            catch (error) {
                throw new Error('Encountered an issue saving a record to the database');
            }
        }
    }
    get syncErrors() {
        return this.#syncErrors;
    }
    get saveErrors() {
        return this.#saveErrors;
    }
    get syncResults() {
        return this.#batchCreateOutput;
    }
}
const syncContactsToHubSpot = async () => {
    const prisma = new client_1.PrismaClient();
    const localContacts = await prisma.contacts.findMany({
        where: { hs_object_id: null }
    });
    const syncJob = await prisma.syncJobs.create({
        data: { executionTime: new Date() }
    });
    let start = 0;
    let finalResults = [];
    let finalErrors = [];
    const syncJobId = syncJob.id;
    console.log(`===== Starting Sync Job for ${localContacts.length} contacts =====`);
    while (localContacts.length > 0) {
        let batch = splitBatchByMaxBatchSize(localContacts, start);
        const syncCohort = new BatchToBeSynced(batch, clients_1.hubspotClient);
        await syncCohort.batchRead();
        syncCohort.removeKnownContactsFromBatch();
        if (syncCohort.mapOfEmailsToNativeIds.size === 0) {
            // take the next set of 100 contacts
            console.log('all contacts where known, no need to create');
        }
        else {
            await syncCohort.sendNetNewContactsToHubspot();
            const errors = syncCohort.syncErrors;
            const results = syncCohort.syncResults;
            if (errors) {
                finalErrors.push(errors);
            }
            finalResults.push(results);
            console.log(`===== Finished current cohort, still have ${localContacts.length} contacts to sync =====`);
        }
        await syncCohort.saveHSContactIDToDatabase();
    }
    const finalResultsString = JSON.stringify(finalResults);
    const finalErrorsString = JSON.stringify(finalErrors);
    // Update the data assignment
    await prisma.syncJobs.update({
        where: { id: syncJobId },
        data: { success: finalResultsString, failures: finalErrorsString }
    });
    console.log(`==== Batch sync complete, this job produced ${finalResults.length} successes and ${finalErrors.length} errors, check the syncJobs table for full results ====`);
    return { results: { success: finalResults, errors: finalErrors } };
};
exports.syncContactsToHubSpot = syncContactsToHubSpot;
