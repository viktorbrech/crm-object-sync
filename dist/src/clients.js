"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hubspotClient = exports.prisma = void 0;
const client_1 = require("@prisma/client");
const api_client_1 = require("@hubspot/api-client");
const DEFAULT_LIMITER_OPTIONS = {
    minTime: 1000 / 9,
    maxConcurrent: 6,
    id: 'hubspot-client-limiter'
};
exports.prisma = new client_1.PrismaClient();
exports.hubspotClient = new api_client_1.Client({
    limiterOptions: DEFAULT_LIMITER_OPTIONS
});
