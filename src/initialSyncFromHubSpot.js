"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initialContactsSync = void 0;
require("dotenv/config");
const client_1 = require("@prisma/client");
const auth_1 = require("./auth");
const utils_1 = require("./utils");
const clients_1 = require("./clients");
// Use verbose (but slower) create or update functionality
const useVerboseCreateOrUpdate = false;
// HubSpot client rate limit settings
// HubSpot Client arguments
// Unused values must be undefined to avoid HubSpot client errors
const pageLimit = 100;
let after;
const propertiesToGet = ['firstname', 'lastname', 'email'];
let propertiesToGetWithHistory;
let associationsToGet;
const getArchived = false;
// Update function 1 - use upsert to create or update records
// Faster but less verbose tracking of created vs. updated
const upsertContact = async (contactData) => {
    let upsertRecord;
    let upsertResult;
    if (contactData.properties.email) {
        // Create the contact if no matching email
        // On matching email, update the HS ID but nothing else
        upsertRecord = await clients_1.prisma.contacts.upsert({
            where: {
                email: contactData.properties.email
            },
            update: {
                // add the hs ID but don't update anything else
                hs_object_id: contactData.id
            },
            create: {
                email: contactData.properties.email,
                first_name: contactData.properties.firstname,
                last_name: contactData.properties.lastname,
                hs_object_id: contactData.id
            }
        });
        upsertResult = 'upsert';
    }
    else {
        // no email, create without email
        upsertRecord = await clients_1.prisma.contacts.create({
            data: {
                first_name: contactData.properties.firstname,
                last_name: contactData.properties.lastname,
                hs_object_id: contactData.id
            }
        });
        upsertResult = 'created';
    }
    let result = {
        recordDetails: upsertRecord,
        updateResult: upsertResult
    };
    return result;
};
// Update function 2 - Try to create the record, fall back to update if that fails
// Slower and will result in DB errors, but explicit tracking of created
const verboseCreateOrUpdate = async (contactData) => {
    let prismaRecord;
    let updateResult;
    try {
        prismaRecord = await clients_1.prisma.contacts.create({
            data: {
                email: contactData.properties.email,
                first_name: contactData.properties.firstname,
                last_name: contactData.properties.lastname,
                hs_object_id: contactData.id
            }
        });
        updateResult = 'created';
    }
    catch (error) {
        console.log(error);
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError) {
            if (error.code === 'P2002') {
                const contactDataWithEmail = contactData; // Tell TS we always have an email address in this case
                // failed on unique property (i.e. email)
                // Update  existing record by email, just add HS record id to record
                prismaRecord = await clients_1.prisma.contacts.update({
                    where: {
                        email: contactDataWithEmail.properties.email
                    },
                    data: {
                        // add the hs ID but don't update anything else
                        hs_object_id: contactData.id
                    }
                });
                updateResult = 'hsID_updated';
            }
            else {
                // some other known error but not existing email
                prismaRecord = {
                    id: -1,
                    email: contactData.properties.email,
                    first_name: contactData.properties.firstname,
                    last_name: contactData.properties.lastname,
                    hs_object_id: contactData.id
                };
                updateResult = error.code; // log Prisma error code, will be tracked as error in results
            }
        }
        else {
            // Any other failed create result
            prismaRecord = {
                id: -1,
                email: contactData.properties.email,
                first_name: contactData.properties.firstname,
                last_name: contactData.properties.lastname,
                hs_object_id: contactData.id
            };
            updateResult = 'failed';
        }
    }
    let result = {
        recordDetails: prismaRecord,
        updateResult: updateResult
    };
    return result;
};
// Initial sync FROM HubSpot contacts TO (local) database
const initialContactsSync = async () => {
    console.log('started sync');
    const customerId = (0, utils_1.getCustomerId)();
    const accessToken = await (0, auth_1.getAccessToken)(customerId);
    // Track created/updated/upserted/any errors
    let jobRunResults = {
        upsert: {
            count: 0,
            records: []
        },
        created: {
            count: 0,
            records: []
        },
        failed: {
            count: 0,
            records: []
        },
        hsID_updated: {
            count: 0,
            records: []
        },
        errors: {
            count: 0,
            records: []
        }
    };
    // Get all contacts using client
    const allContactsResponse = await clients_1.hubspotClient.crm.contacts.getAll(pageLimit, after, propertiesToGet, propertiesToGetWithHistory, associationsToGet, getArchived);
    console.log(`Found ${allContactsResponse.length} contacts`);
    for (const element of allContactsResponse) {
        let createOrUpdateContactResult;
        if (useVerboseCreateOrUpdate) {
            createOrUpdateContactResult = await verboseCreateOrUpdate(element);
        }
        else {
            createOrUpdateContactResult = await upsertContact(element);
        }
        // Add to overall results based on result of create/update result
        switch (createOrUpdateContactResult.updateResult) {
            case 'upsert':
                jobRunResults.upsert.count += 1;
                jobRunResults.upsert.records.push(createOrUpdateContactResult);
                break;
            case 'created':
                jobRunResults.created.count += 1;
                jobRunResults.created.records.push(createOrUpdateContactResult);
                break;
            case 'hsID_updated':
                jobRunResults.hsID_updated.count += 1;
                jobRunResults.hsID_updated.records.push(createOrUpdateContactResult);
                break;
            case 'failed':
                jobRunResults.failed.count += 1;
                jobRunResults.failed.records.push(createOrUpdateContactResult);
                break;
            default:
                jobRunResults.errors.count += 1;
                jobRunResults.errors.records.push(createOrUpdateContactResult);
                break;
        }
    }
    return {
        total: allContactsResponse.length,
        results: jobRunResults
    };
};
exports.initialContactsSync = initialContactsSync;
