# FHIR Security Labeling Service - Deployment Guide

## GitHub Pages Deployment

This service is designed to run as a client-side application on GitHub Pages.

### Deployment Steps

1. **Enable GitHub Pages**
   - Go to your repository settings
   - Navigate to "Pages" section
   - Set source to "Deploy from a branch"
   - Select branch: `main` (or your preferred branch)
   - Select folder: `/ (root)`
   - Click "Save"

2. **Access Your Service**
   - Your service will be available at: `https://[your-username].github.io/sls-ri/`
   - Or if using a custom domain: `https://[your-domain]/`

3. **Files Required**
   - `index.html` - Main application interface
   - `fhir-sls.js` - Core FHIR processing engine
   - `app.js` - UI logic and event handlers
   - `styles.css` - Application styling
   - `.nojekyll` - Prevents Jekyll processing (important!)

### Features

✅ **Client-Side Processing** - All data processing happens in the browser
✅ **No Backend Required** - Perfect for GitHub Pages static hosting
✅ **Browser Storage** - Uses localStorage for ValueSet and rule persistence
✅ **Two APIs**:
   - API 1: Setup Sensitive Topics (ValueSet processing)
   - API 2: Tag Clinical Resources (Security labeling)

### Technical Notes

- **Storage Limit**: localStorage is limited to ~5-10MB per domain
- **Privacy**: All processing happens client-side; no data leaves the browser
- **Browser Compatibility**: Modern browsers (Chrome, Firefox, Safari, Edge)
- **CORS**: No issues since everything runs client-side

### Usage

1. **Setup Phase** (API 1)
   - Load sample ValueSet bundle or paste your own
   - Click "Process ValueSets" to build the rule set
   - View status in the Status tab

2. **Analysis Phase** (API 2)
   - Load sample resource bundle or paste your own
   - Click "Analyze & Tag Resources" to apply security labels
   - Review the output Batch Bundle with labeled resources

### Data Management

- **Export Data**: Download your ValueSets and rules as JSON
- **Import Data**: Restore previously exported data
- **Clear Data**: Remove all stored ValueSets and rules

### Development

To test locally before deploying:

```bash
# Simple HTTP server (Python 3)
python -m http.server 8000

# Or Node.js
npx http-server

# Then open: http://localhost:8000
```

### Customization

You can customize:
- Styling in `styles.css`
- Sample data in `app.js` (loadSampleValueSet/loadSampleResources functions)
- Supported resource types in `fhir-sls.js` (SUPPORTED_RESOURCES array)

### Troubleshooting

**Problem**: Page not loading
- **Solution**: Check that `.nojekyll` file exists in root

**Problem**: JavaScript not working
- **Solution**: Check browser console for errors, ensure all files are loaded

**Problem**: Data not persisting
- **Solution**: Check if localStorage is enabled in browser settings

**Problem**: 404 errors
- **Solution**: Wait a few minutes after enabling GitHub Pages, check repository settings

### Architecture

```
Client Browser
├── index.html (UI)
├── app.js (Event Handlers)
├── fhir-sls.js (Core Engine)
│   ├── ValueSet Processing
│   ├── Code Analysis
│   ├── Security Labeling
│   └── Bundle Generation
└── localStorage (Data Persistence)
```

### Security Considerations

- All processing is client-side for privacy
- No server-side storage or logging
- Data only persists in browser localStorage
- Use Export/Import for backup/transfer
- Consider clearing data after sensitive operations

### Future Enhancements

Potential improvements mentioned in comments but not implemented:
- Provenance resource generation
- AuditEvent resource creation
- PATCH support for minimal updates
- IndexedDB for larger datasets
- Service Worker for offline capability
