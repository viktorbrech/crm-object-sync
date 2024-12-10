"use strict";
require("dotenv/config");
const { PrismaClient } = require("@prisma/client");
const { PORT, getCustomerId } = require("./utils");
const { hubspotClient } = require("./clients");

class MissingRequiredError extends Error {
    constructor(message) {
        super(`${message} is missing, please add it to your .env file`);
    }
}

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

if (!CLIENT_ID) {
    throw new MissingRequiredError('CLIENT_ID');
}

if (!CLIENT_SECRET) {
    throw new MissingRequiredError('CLIENT_SECRET');
}

const REDIRECT_URI = `http://localhost:${PORT}/oauth-callback`;
const SCOPES = [
    'crm.schemas.companies.write',
    'crm.schemas.contacts.write',
    'crm.schemas.companies.read',
    'crm.schemas.contacts.read',
    'crm.objects.companies.write',
    'crm.objects.contacts.write',
    'crm.objects.companies.read',
    'crm.objects.contacts.read'
];

const EXCHANGE_CONSTANTS = {
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET
};

const prisma = new PrismaClient();
const scopeString = SCOPES.join(' ');

const authUrl = hubspotClient.oauth.getAuthorizationUrl(CLIENT_ID, REDIRECT_URI, scopeString);

const getExpiresAt = (expiresIn) => {
    const now = new Date();
    return new Date(now.getTime() + expiresIn * 1000);
};

const redeemCode = async (code) => {
    return await exchangeForTokens({
        ...EXCHANGE_CONSTANTS,
        code,
        grant_type: 'authorization_code'
    });
};

const getHubSpotId = async (accessToken) => {
    hubspotClient.setAccessToken(accessToken);
    const response = await hubspotClient.apiRequest({
        path: '/account-info/v3/details',
        method: 'GET'
    });
    const accountInfo = await response.json();
    return accountInfo.portalId.toString();
};

const exchangeForTokens = async (exchangeProof) => {
    const { code, redirect_uri, client_id, client_secret, grant_type, refresh_token } = exchangeProof;
    try {
        const tokenResponse = await hubspotClient.oauth.tokensApi.create(grant_type, code, redirect_uri, client_id, client_secret, refresh_token);
        const { accessToken, refreshToken, expiresIn } = tokenResponse;
        const expiresAt = getExpiresAt(expiresIn);
        const customerId = getCustomerId();
        const hsPortalId = await getHubSpotId(accessToken);

        return await prisma.authorization.upsert({
            where: { customerId },
            update: { refreshToken, accessToken, expiresIn, expiresAt, hsPortalId },
            create: { refreshToken, accessToken, expiresIn, expiresAt, hsPortalId, customerId }
        });
    } catch (e) {
        console.error(`Error exchanging ${exchangeProof.grant_type} for access token`, e);
        throw e;
    }
};

const getAccessToken = async (customerId) => {
    try {
        const currentCreds = await prisma.authorization.findFirst({
            select: { accessToken: true, expiresAt: true, refreshToken: true },
            where: { customerId }
        });

        if (currentCreds?.expiresAt && currentCreds.expiresAt > new Date()) {
            return currentCreds.accessToken;
        } else {
            const updatedCreds = await exchangeForTokens({
                ...EXCHANGE_CONSTANTS,
                grant_type: 'refresh_token',
                refresh_token: currentCreds?.refreshToken
            });

            if (updatedCreds instanceof Error) {
                throw updatedCreds;
            } else {
                return updatedCreds.accessToken;
            }
        }
    } catch (error) {
        console.error(error);
        throw error;
    }
};

module.exports = {
    authUrl,
    exchangeForTokens,
    redeemCode,
    getAccessToken
};
