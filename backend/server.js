/**
 * FHIR Security Labeling Service - Backend API Server
 * Express server providing REST APIs for ValueSet processing and resource analysis
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
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

// API 1: Process ValueSet Bundle
app.post('/api/v1/valuesets', async (req, res) => {
    try {
        const bundle = req.body;
        
        if (!bundle) {
            return res.status(400).json({
                error: 'Request body is required'
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

// API 2: Analyze and Tag Resources
app.post('/api/v1/analyze', (req, res) => {
    try {
        const bundle = req.body;
        
        if (!bundle) {
            return res.status(400).json({
                error: 'Request body is required'
            });
        }

        const batchBundle = slsService.analyzeResourceBundle(bundle);
        
        res.status(200).json(batchBundle);
        
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

// API 2 Variant: Analyze and Tag Resources - Return Full Bundle
app.post('/api/v1/analyze-full', (req, res) => {
    try {
        const bundle = req.body;
        
        if (!bundle) {
            return res.status(400).json({
                error: 'Request body is required'
            });
        }

        const fullBundle = slsService.analyzeResourceBundleFull(bundle);
        
        res.status(200).json(fullBundle);
        
    } catch (error) {
        console.error('Error analyzing resources (full bundle):', error);
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

// Get system status
app.get('/api/v1/status', (req, res) => {
    try {
        const status = slsService.getStatus();
        res.json(status);
    } catch (error) {
        console.error('Error getting status:', error);
        res.status(500).json({
            error: 'Failed to get status',
            message: error.message
        });
    }
});

// Clear all data
app.delete('/api/v1/data', (req, res) => {
    try {
        slsService.clearAllData();
        res.json({
            message: 'All data cleared successfully'
        });
    } catch (error) {
        console.error('Error clearing data:', error);
        res.status(500).json({
            error: 'Failed to clear data',
            message: error.message
        });
    }
});

// Serve static frontend files from the parent directory
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Catch-all route for SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
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
    console.log(`API v1: http://localhost:${PORT}/api/v1`);
    console.log('=================================');
});

module.exports = app;
