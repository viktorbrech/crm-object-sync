// Import the PrismaClient constructor from the @prisma/client package
const { PrismaClient } = require('@prisma/client');

// Instantiate a new PrismaClient instance
const prisma = new PrismaClient();

// Export the PrismaClient instance for use in other parts of the application
module.exports = prisma;