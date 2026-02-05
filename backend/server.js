/**
 * FHIR Security Labeling Service - Backend API Server
 * Express server providing REST APIs for ValueSet processing and resource analysis
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const FHIRSecurityLabelingService = require('./fhir-sls-service');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'sls.db');

// Initialize service
let slsService;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Initialize service on startup
try {
    slsService = new FHIRSecurityLabelingService(DB_PATH);
    console.log('✓ FHIR SLS Service initialized');
} catch (error) {
    console.error('✗ Failed to initialize SLS Service:', error);
    process.exit(1);
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// FHIR Metadata endpoint - CapabilityStatement
app.get('/metadata', (req, res) => {
    try {
        const capabilityStatement = JSON.parse(
            fs.readFileSync(path.join(__dirname, 'CapabilityStatement-fhir-sls-server.json'), 'utf8')
        );
        // Update implementation URL with actual base URL
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        capabilityStatement.implementation.url = baseUrl;
        res.json(capabilityStatement);
    } catch (error) {
        console.error('Error serving CapabilityStatement:', error);
        res.status(500).json({
            resourceType: 'OperationOutcome',
            issue: [{
                severity: 'error',
                code: 'exception',
                diagnostics: 'Failed to load CapabilityStatement'
            }]
        });
    }
});

// Serve OperationDefinitions
app.get('/OperationDefinition/:id', (req, res) => {
    try {
        const filePath = path.join(__dirname, `OperationDefinition-${req.params.id}.json`);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                resourceType: 'OperationOutcome',
                issue: [{
                    severity: 'error',
                    code: 'not-found',
                    diagnostics: `OperationDefinition/${req.params.id} not found`
                }]
            });
        }
        const operationDef = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        res.json(operationDef);
    } catch (error) {
        console.error('Error serving OperationDefinition:', error);
        res.status(500).json({
            resourceType: 'OperationOutcome',
            issue: [{
                severity: 'error',
                code: 'exception',
                diagnostics: 'Failed to load OperationDefinition'
            }]
        });
    }
});

// FHIR Operation: $sls-load-valuesets
app.post('/$sls-load-valuesets', async (req, res) => {
    try {
        const bundle = req.body;
        
        if (!bundle) {
            return res.status(400).json({
                resourceType: 'OperationOutcome',
                issue: [{
                    severity: 'error',
                    code: 'required',
                    diagnostics: 'Parameter "bundle" is required'
                }]
            });
        }

        const outcome = await slsService.processValueSetBundle(bundle);
        
        // Check if operation was successful
        const isError = outcome.issue[0].severity === 'error';
        const statusCode = isError ? 400 : 200;
        
        res.status(statusCode).json(outcome);
        
    } catch (error) {
        console.error('Error processing ValueSets:', error);
        res.status(500).json({
            resourceType: 'OperationOutcome',
            issue: [{
                severity: 'error',
                code: 'exception',
                diagnostics: `Server error: ${error.message}`
            }]
        });
    }
});

// FHIR Operation: $security-label
app.post('/$security-label', (req, res) => {
    try {
        const bundle = req.body;
        const mode = req.query.mode || 'batch';
        
        if (!bundle) {
            return res.status(400).json({
                resourceType: 'OperationOutcome',
                issue: [{
                    severity: 'error',
                    code: 'required',
                    diagnostics: 'Parameter "bundle" is required'
                }]
            });
        }

        let resultBundle;
        if (mode === 'full') {
            resultBundle = slsService.analyzeResourceBundleFull(bundle);
        } else {
            resultBundle = slsService.analyzeResourceBundle(bundle);
        }
        
        res.status(200).json(resultBundle);
        
    } catch (error) {
        console.error('Error analyzing resources:', error);
        res.status(400).json({
            resourceType: 'OperationOutcome',
            issue: [{
                severity: 'error',
                code: 'processing',
                diagnostics: error.message
            }]
        });
    }
});

// Serve static frontend files (supports both local dev and Docker)
const frontendPath = process.env.FRONTEND_PATH || path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

// Catch-all route for SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: err.message
    });
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    slsService.close();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully...');
    slsService.close();
    process.exit(0);
});

// Start server
app.listen(PORT, () => {
    console.log('=================================');
    console.log('FHIR Security Labeling Service');
    console.log('=================================');
    console.log(`Server: http://localhost:${PORT}`);
    console.log(`Health: http://localhost:${PORT}/health`);
    console.log(`Metadata: http://localhost:${PORT}/metadata`);
    console.log('=================================');
});

module.exports = app;
