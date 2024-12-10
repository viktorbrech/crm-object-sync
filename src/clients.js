"use strict";

const { PrismaClient } = require("@prisma/client");
const { Client } = require("@hubspot/api-client");

const DEFAULT_LIMITER_OPTIONS = {
    minTime: 1000 / 9,
    maxConcurrent: 6,
    id: 'hubspot-client-limiter'
};

const prisma = new PrismaClient();
const hubspotClient = new Client({
    limiterOptions: DEFAULT_LIMITER_OPTIONS
});

module.exports = {
    prisma,
    hubspotClient
};
