"use strict";
require("dotenv/config");
const { PrismaClient } = require("@prisma/client");
const { getAccessToken } = require("./auth");
const { getCustomerId } = require("./utils");
const { prisma, hubspotClient } = require("./clients");

const useVerboseCreateOrUpdate = false;
const pageLimit = 100;
const propertiesToGet = ['firstname', 'lastname', 'email'];
const getArchived = false;

const upsertContact = async (contactData) => {
    let upsertRecord;
    let upsertResult;

    if (contactData.properties.email) {
        upsertRecord = await prisma.contacts.upsert({
            where: { email: contactData.properties.email },
            update: { hs_object_id: contactData.id },
            create: {
                email: contactData.properties.email,
                first_name: contactData.properties.firstname,
                last_name: contactData.properties.lastname,
                hs_object_id: contactData.id
            }
        });
        upsertResult = 'upsert';
    } else {
        upsertRecord = await prisma.contacts.create({
            data: {
                first_name: contactData.properties.firstname,
                last_name: contactData.properties.lastname,
                hs_object_id: contactData.id
            }
        });
        upsertResult = 'created';
    }

    return { recordDetails: upsertRecord, updateResult: upsertResult };
};

const verboseCreateOrUpdate = async (contactData) => {
    let prismaRecord;
    let updateResult;

    try {
        prismaRecord = await prisma.contacts.create({
            data: {
                email: contactData.properties.email,
                first_name: contactData.properties.firstname,
                last_name: contactData.properties.lastname,
                hs_object_id: contactData.id
            }
        });
        updateResult = 'created';
    } catch (error) {
        console.log(error);

        if (error instanceof PrismaClient.PrismaClientKnownRequestError && error.code === 'P2002') {
            prismaRecord = await prisma.contacts.update({
                where: { email: contactData.properties.email },
                data: { hs_object_id: contactData.id }
            });
            updateResult = 'hsID_updated';
        } else {
            prismaRecord = {
                id: -1,
                email: contactData.properties.email,
                first_name: contactData.properties.firstname,
                last_name: contactData.properties.lastname,
                hs_object_id: contactData.id
            };
            updateResult = error.code || 'failed';
        }
    }

    return { recordDetails: prismaRecord, updateResult: updateResult };
};

const initialContactsSync = async () => {
    console.log('started sync');
    const customerId = getCustomerId();
    const accessToken = await getAccessToken(customerId);

    let jobRunResults = {
        upsert: { count: 0, records: [] },
        created: { count: 0, records: [] },
        failed: { count: 0, records: [] },
        hsID_updated: { count: 0, records: [] },
        errors: { count: 0, records: [] }
    };

    const allContactsResponse = await hubspotClient.crm.contacts.getAll(pageLimit, undefined, propertiesToGet, undefined, undefined, getArchived);
    console.log(`Found ${allContactsResponse.length} contacts`);

    for (const element of allContactsResponse) {
        let createOrUpdateContactResult;

        if (useVerboseCreateOrUpdate) {
            createOrUpdateContactResult = await verboseCreateOrUpdate(element);
        } else {
            createOrUpdateContactResult = await upsertContact(element);
        }

        switch (createOrUpdateContactResult.updateResult) {
            case 'upsert':
                jobRunResults.upsert.count++;
                jobRunResults.upsert.records.push(createOrUpdateContactResult);
                break;
            case 'created':
                jobRunResults.created.count++;
                jobRunResults.created.records.push(createOrUpdateContactResult);
                break;
            case 'hsID_updated':
                jobRunResults.hsID_updated.count++;
                jobRunResults.hsID_updated.records.push(createOrUpdateContactResult);
                break;
            case 'failed':
                jobRunResults.failed.count++;
                jobRunResults.failed.records.push(createOrUpdateContactResult);
                break;
            default:
                jobRunResults.errors.count++;
                jobRunResults.errors.records.push(createOrUpdateContactResult);
                break;
        }
    }

    return {
        total: allContactsResponse.length,
        results: jobRunResults
    };
};

module.exports = { initialContactsSync };
