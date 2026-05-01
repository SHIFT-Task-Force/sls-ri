# FHIR Security Labeling Service (SLS)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![FHIR](https://img.shields.io/badge/FHIR-R4-red.svg)](http://hl7.org/fhir/R4/)
[![GitHub Pages](https://img.shields.io/badge/Demo-Live-success.svg)](https://SHIFT-Task-Force.github.io/sls-ri/)
[![AI Generated](https://img.shields.io/badge/AI-GitHub%20Copilot-purple.svg)](https://github.com/features/copilot)

This repository contains a prototype implementation of a FHIR Security Labeling Service (SLS) designed to analyze FHIR resources for sensitive information and apply appropriate security labels based on predefined rules. This project is a Reference Implementation and the code is written for readability and not optimized. Where optimizations are possible, comments are included to indicate potential improvements for production use.

> **🤖 AI-Generated Project**: This entire codebase was generated using **GitHub Copilot in VS Code with Claude Sonnet 4.5** to demonstrate AI-assisted development of healthcare interoperability solutions. From the core FHIR processing logic to the Docker deployment configuration, GitHub Copilot (powered by Claude AI) assisted in creating a complete, production-ready implementation. At the direction of John Moehrke of [Moehrke Research LLC](https://MoehrkeResearch.com).

Supporting clinical Resources found in FHIR US-Core Implementation Guide (USCDI v4) are prioritized.

- AllergyIntolerance
- Condition
- Procedure
- Immunization
- MedicationRequest
- Medication
- CarePlan
- CareTeam
- Goal
- Observation
- DiagnosticReport
- DocumentReference
- QuestionnaireResponse
- Specimen
- Encounter
- ServiceRequest
- Skipping the following resources as not carrying clinical data:
  - Patient
  - Practitioner
  - PractitionerRole
  - Organization
  - Location
  - RelatedPerson
  - Provenance
  - ValueSet

## Overview

This is a Web Service that has the following 2 APIs:

1. Setup Sensitive topics
    - Receives a FHIR Bundle or single ValueSet containing codes that define sensitive categories (e.g., mental health, substance abuse, HIV status).
    - for Each ValueSet resource
        - Processes and stores these ValueSet resources to build an internal rule set for identifying sensitive information in FHIR resources.
        - Each ValueSet the expansion will hold codes from standard terminologies (e.g., SNOMED CT, LOINC, ICD-10) that correspond to sensitive topics.
          - If no expansion is present. The tx.fhir.org public terminology server is called to expand the ValueSet and retrieve the codes. This uses the ValueSet/$expand operation, passing in the ValueSet to the valueSet parameter.
        - Extracting the sensitive codes
        - The Sensitive topic code(s) are indicated in either:
            - `ValueSet.topic[].coding[0]` element (supports multiple topic entries), OR
            - `ValueSet.useContext[]` with `code.code = 'focus'` and the topic in `valueCodeableConcept.coding[0]` (supports multiple focus contexts)
        - **Multiple Topics**: A single ValueSet can have multiple topic codes (e.g., PSYTHPN, SUD, BH). All topics from all focus contexts are extracted and applied to matching codes.
    - Recording the latest dateTime from the ValueSet.expansion.timestamp or ValueSet.date element to determine the newest effective date for sensitive category knowledge.
    - Returning an OperationOutcome indicating success or failure of the ValueSet processing.
2. Tag a Bundle of Clinical Resources
    - Receives a FHIR Bundle holding one or more FHIR resources (e.g., Condition, Observation, MedicationStatement) to be analyzed for sensitive information.
    - Inspecting FHIR Bundle entries and processing each resource as follows:
        - If the resource.meta element has an extension `http://hl7.org/fhir/StructureDefinition/lastSourceSync`, and the valueDateTime is equal to or later than the latest ValueSet.date; then this resource does not need to be re-analyzed and therefore is skipped and not included in the output Bundle.
        - Analyzing each resource's elements that are code, coding, or codeableConcept to identify any codes that match the internal rule set of sensitive categories.
        - For resources that contain sensitive information, applying FHIR security labels to the resource's meta.security element, including:
            - The confidentialityCode `R` (restricted)
            - Topic-specific security labels from matched sensitive categories
        - Add the lastSourceSync extension to the resource's meta element with the current dateTime.
        - **Encounter tag propagation**: If the resource has an `encounter` element (e.g., `Observation.encounter`) referencing an Encounter resource that is present in the Bundle, the same sensitivity labels are also applied to that Encounter. The Encounter receives a deduplicated union of all sensitivity tags from every clinical resource that references it, and its lastSourceSync timestamp is updated. If the Encounter was previously skipped (already up-to-date), it is still included in the output Bundle with the newly propagated tags.
    - Build a new FHIR Batch Bundle, with update actions for each Resource that was analyzed.
    - The output Bundle.meta.security contains distinct (deduplicated) security labels from all resources in the bundle, providing a summary of all sensitive categories present.
    - Returning the Batch Bundle as the response.

```mermaid
graph LR
  subgraph API1["API 1: Setup Sensitive Topics"]
    A[ValueSet Bundle or<br/>Single ValueSet] --> B[Load & Store ValueSets]
    B --> C[Build Internal Rule Set<br/>from expansion codes]
    C --> D[Extract topic from<br/>topic or useContext]
    D --> E[Track Latest ValueSet.date]
    E --> F[Return OperationOutcome]
  end
  
  subgraph API2["API 2: Tag Clinical Resources"]
    G[Resource Bundle] --> H{Check meta.lastSourceSync}
    H -->|Equal/Later than latest ValueSet.date| I[Skip - No Re-analysis]
    H -->|Needs Analysis| J[Code Analysis Engine]
    
    J --> K{Analyze code/coding/codeableConcept}
    K --> L{Match Sensitive Topic?}
    L -->|Yes| M[Apply meta.security=topic<br/>confidentialityCode: R]
    L -->|No| N[No Labeling Needed]
    
    M --> O[Add lastSourceSync to meta]
    N --> O
    
    O --> P[Build Batch Bundle<br/>with update actions]
    P --> R[Collect Distinct Security Labels]
    R --> S[Add to Bundle.meta.security]
    S --> Q[Return Batch Bundle]
  end
  
  API1 -.-> API2
  
  style M fill:#ffcccc
  style N fill:#ccffcc
  ```

## FHIR Operations

This service implements two FHIR operations following the [FHIR R4 Operations Framework](http://hl7.org/fhir/R4/operations.html):

### 1. `$sls-load-valuesets` - Load ValueSets

**Endpoint**: `POST [base]/$sls-load-valuesets`

Loads and processes ValueSet resources to establish security labeling rules. Accepts a Bundle of ValueSets and returns an OperationOutcome.

### 2. `$sls-tag` - Analyze and Label Resources

**Endpoint**: `POST [base]/$sls-tag?mode={batch|full}`

Analyzes clinical resources for sensitive information and applies security labels. Supports two modes:
- `batch` (default): Returns only modified resources
- `full`: Returns all resources, preserving Bundle structure

### FHIR Metadata

**CapabilityStatement**: `GET [base]/metadata`

Returns the server's capabilities, supported operations, and FHIR version.

**OperationDefinitions**: Available at:
- `GET [base]/OperationDefinition/sls-load-valuesets`
- `GET [base]/OperationDefinition/sls-tag`

### Support/Admin Endpoints (Non-FHIR Operations)

These endpoints support UI status, health monitoring, and administrative reset:

- `GET [base]/health` - Service health check
- `GET [base]/status` - Current ValueSets, rules summary, latest knowledge date, and processing statistics
- `POST [base]/admin/clear-data` - Clears stored ValueSets/rules/metadata/statistics
- `GET [base]/status.html` - Standalone status dashboard page

> The two core SLS business operations remain `POST [base]/$sls-load-valuesets` and `POST [base]/$sls-tag`.

> **For complete technical details**, including parameter specifications, database schema, and full examples, see [FHIR.md](FHIR.md)

## Getting Started

### Deployment Options

This service can be deployed in two ways:

#### Option 1: Docker Deployment (Recommended for Production)

Full backend API with persistent database:

```bash
# Clone the repository
git clone https://github.com/SHIFT-Task-Force/sls-ri.git
cd sls-ri

# Start with Docker Compose
docker-compose up -d

# Access at http://localhost:3000
```

**Access Points:**
- **Main Interface**: http://localhost:3000
- **Status Dashboard**: http://localhost:3000/status.html
- **FHIR Metadata**: http://localhost:3000/metadata

See [DOCKER.md](DOCKER.md) for complete Docker deployment guide.

**Features:**
- ✅ REST API endpoints
- ✅ Persistent SQLite database
- ✅ Containerized deployment
- ✅ Production-ready
- ✅ Scalable architecture

#### Option 2: GitHub Pages (Client-Side Only)

Static hosting with browser-based processing:

1. **Visit the Live Demo**: [https://SHIFT-Task-Force.github.io/sls-ri/](https://SHIFT-Task-Force.github.io/sls-ri/)

2. **Or Run Locally**:
   ```bash
   # Clone the repository
   git clone https://github.com/SHIFT-Task-Force/sls-ri.git
   cd sls-ri

   # Start a local web server
   python -m http.server 8000
   # Or use Node.js: npx http-server

   # Open in browser
   # Navigate to: http://localhost:8000
   ```

**Features:**
- ✅ No backend required
- ✅ Free GitHub Pages hosting
- ✅ Browser localStorage
- ✅ Complete privacy (client-side only)
- ⚠️ URL fetching may be limited by CORS policies (use Docker deployment for unrestricted URL access)

### Using the Service

> **Note**: The "Load Sample ValueSet Bundle" and "Load Sample Resource Bundle" buttons in the web interface provide comprehensive examples demonstrating multiple topics per ValueSet, cross-ValueSet matching, and other advanced features.

1. **Load ValueSets** (API 1: Setup Sensitive Topics)
   - Paste JSON directly or fetch from URL
   - Click "Process ValueSets"
   - **Note**: URL fetching in GitHub Pages may fail due to CORS restrictions

2. **Analyze Resources** (API 2: Tag Clinical Resources)
   - Paste a Bundle of clinical resources or fetch from URL
   - Choose analysis mode:
     - **"Analyze & Tag Resources"**: Complete Bundle with all resources
     - **"Analyze into Update Bundle"**: Only modified resources
   - Click "Copy to Clipboard" to export results

**Output includes:**
- `meta.security` with confidentialityCode `R` and topic-specific labels
- `meta.extension` with lastSourceSync timestamp
- Bundle-level `meta.security` summarizing all sensitive content types

> **For detailed JSON examples and complete API documentation**, see [FHIR.md](FHIR.md)

## Project Structure

```
sls-ri/
├── backend/                                      # Backend API Service (Docker)
│   ├── server.js                                # Express API server
│   ├── fhir-sls-service.js                      # Core FHIR processing engine
│   ├── package.json                             # Node.js dependencies
│   ├── Dockerfile                               # Backend container config
│   ├── CapabilityStatement-fhir-sls-server.json # FHIR server capabilities
│   ├── OperationDefinition-sls-load-valuesets.json
│   └── OperationDefinition-sls-tag.json
├── frontend/               # Frontend UI
│   ├── index.html         # Main application interface
│   ├── app.js             # UI logic (backend API calls)
│   └── styles.css         # Application styling
├── index.html             # GitHub Pages version (client-side)
├── fhir-sls.js           # Client-side core engine
├── app.js                # Client-side UI logic
├── styles.css            # Shared styling
├── docker-compose.yml    # Docker orchestration
├── README.md             # This file
├── FHIR.md               # FHIR conformance resources documentation
├── DOCKER.md             # Docker deployment guide
├── DEPLOYMENT.md         # GitHub Pages deployment guide
└── .dockerignore         # Docker build exclusions
```

## Technology Stack

### Backend (Docker Deployment)
- **Runtime**: Node.js 18 (Alpine Linux)
- **Framework**: Express.js
- **Database**: SQLite (better-sqlite3)
- **Container**: Docker + Docker Compose
- **Deployment**: Docker-ready, cloud-deployable (AWS, Azure, GCP)

### Frontend (Both Deployments)
- **Frontend**: Pure HTML5, CSS3, JavaScript (ES6+)
- **Standards**: FHIR R4, US Core Implementation Guide (USCDI v4)

### Client-Side Only (GitHub Pages)
- **Storage**: Browser localStorage API
- **Deployment**: GitHub Pages (static hosting)

### Why Two Deployment Options?

#### Docker (Backend + Database)
- ✅ **Production-Ready**: Proper API service with persistent storage
- ✅ **Scalable**: Can handle multiple concurrent users
- ✅ **Stateful**: Database persists across sessions
- ✅ **API Access**: Can be called by any HTTP client
- ✅ **Cloud-Ready**: Deploy to AWS, Azure, GCP

#### GitHub Pages (Client-Side)
- ✅ **Privacy**: No data leaves the user's browser
- ✅ **Simplicity**: No backend infrastructure required
- ✅ **Cost**: Free hosting on GitHub Pages
- ✅ **Portability**: Works offline after initial load
- ✅ **Transparency**: All code is visible and auditable

## Architecture

### Docker Deployment (Backend + Frontend)

```
┌─────────────────────────────────────┐
│       Docker Container              │
├─────────────────────────────────────┤
│  Express.js Server (Port 3000)      │
│    ├─ FHIR Operations             │
│    ├─ Static Frontend Files        │
│    └─ SQLite Database (Volume)     │
└─────────────────────────────────────┘
         ↑
         │ HTTP/FHIR
         ↓
┌─────────────────────────────────────┐
│      Client Browser                 │
│  ├─ UI (HTML/CSS/JS)               │
│  └─ FHIR Operations calls          │
└─────────────────────────────────────┘
```

### GitHub Pages Deployment (Client-Side Only)

```
┌─────────────────────────────────────┐
│         Browser (Client)            │
├─────────────────────────────────────┤
│  index.html (UI Layer)              │
│    ↓                                │
│  app.js (Event Handlers)            │
│    ↓                                │
│  fhir-sls.js (Core Engine)          │
│    ├─ ValueSet Processing           │
│    ├─ Code Analysis                 │
│    ├─ Security Labeling             │
│    └─ Bundle Generation             │
│    ↓                                │
│  localStorage (Persistence)         │
└─────────────────────────────────────┘
```

## Key Features

### 🔒 Security Labeling
- Applies FHIR `meta.security` labels based on sensitive content
- Uses confidentialityCode `R` (restricted) for sensitive resources
- Adds topic-specific security labels from ValueSet definitions
- **Bundle-level security summary**: `Bundle.meta.security` contains distinct security labels from all resources, providing an at-a-glance view of sensitive content types

### 📊 Smart Analysis
- Recursively searches all `code`, `coding`, and `codeableConcept` elements
- Matches against terminology codes (SNOMED CT, LOINC, ICD-10)
- **Multiple topics per code**: Single code can trigger multiple security labels when matching ValueSets with multiple focus contexts
- **Cross-ValueSet matching**: Code can match multiple ValueSets, applying all relevant security labels
- **Encounter tag propagation**: Sensitivity labels are automatically propagated to the Encounter referenced by a clinical resource's `encounter` element when that Encounter is present in the same Bundle
- Skips resources already analyzed (via `lastSourceSync` extension)

### 💾 Data Persistence
- Stores ValueSets and rules in browser localStorage
- Export/Import functionality for backup and sharing
- Status dashboard for monitoring loaded data

### 🎯 US Core Compliance
Supports 16 clinical resource types from USCDI v4:
- AllergyIntolerance, Condition, Procedure, Immunization
- MedicationRequest, Medication, CarePlan, CareTeam, Goal
- Observation, DiagnosticReport, DocumentReference
- QuestionnaireResponse, Specimen, Encounter, ServiceRequest

## Limitations

### Docker Deployment
⚠️ **SQLite**: Single-writer limitation (use PostgreSQL for high concurrency)
⚠️ **Scaling**: Horizontal scaling requires shared database
⚠️ **Resources**: Requires Docker infrastructure

### GitHub Pages Deployment  
⚠️ **Storage**: localStorage limited to ~5-10MB per domain
⚠️ **Performance**: Not optimized for large datasets (100s of resources)
⚠️ **Persistence**: Data only in browser, no server backup

### Both Deployments
⚠️ **Browsers**: Requires modern browser with ES6+ support
⚠️ **Scale**: Designed for reference/demonstration, not production use at scale

## Contributing

Contributions are welcome! This is an open-source reference implementation.

### How to Contribute

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Test locally
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Code Style

- Write readable code (prioritize clarity over optimization)
- Add comments explaining healthcare/FHIR-specific logic
- Follow existing patterns in the codebase
- Test with sample data before submitting

## Use Cases

This service can be used for:

- **Privacy Protection**: Automatically label sensitive healthcare data
- **Access Control**: Support fine-grained authorization decisions
- **Compliance**: Meet regulatory requirements (HIPAA, 42 CFR Part 2)
- **Research**: De-identification workflows and sensitive data filtering
- **Education**: Learn FHIR security labeling concepts
- **Prototyping**: Test security labeling strategies

## Standards & Specifications

- [FHIR R4 Operations Framework](http://hl7.org/fhir/R4/operations.html)
- [FHIR R4 Security Labels](http://hl7.org/fhir/R4/security-labels.html)
- [FHIR R4 Meta Element](http://hl7.org/fhir/R4/resource.html#Meta)
- [FHIR R4 CapabilityStatement](http://hl7.org/fhir/R4/capabilitystatement.html)
- [US Core Implementation Guide](http://hl7.org/fhir/us/core/)
- [HL7 Security Labeling Service](https://www.hl7.org/implement/standards/product_brief.cfm?product_id=345)
- [USCDI v4](https://www.healthit.gov/isa/united-states-core-data-interoperability-uscdi)

For detailed information about FHIR conformance resources, OperationDefinitions, and CapabilityStatement, see [FHIR.md](FHIR.md).

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- **GitHub Copilot with Claude Sonnet 4.5** 🤖 - This project was entirely developed using GitHub Copilot in Visual Studio Code, powered by Anthropic's Claude Sonnet 4.5 model. All code, documentation, Docker configuration, and deployment scripts were generated through AI-assisted development, demonstrating the power of advanced AI models in healthcare software development.
- **Visual Studio Code** - The integrated development environment that hosted the AI-assisted development workflow
- **SHIFT Task Force** - Project sponsorship and healthcare expertise
- **HL7 FHIR Community** - Standards development and guidance
- **US Core Contributors** - Implementation guide development
- **Mohammad Jafari** - Initial LEAP Reference Implementation and project lead for DS4P
- **John Moehrke** - Project direction and healthcare security expertise

## Support & Contact

- **Issues**: [GitHub Issues](https://github.com/SHIFT-Task-Force/sls-ri/issues)
- **Discussions**: [GitHub Discussions](https://github.com/SHIFT-Task-Force/sls-ri/discussions)
- **Documentation**: See [DEPLOYMENT.md](DEPLOYMENT.md) for deployment details

## Roadmap

Potential future enhancements:

- [ ] Frontend support for uploading clinical content in a zip
- [ ] Provenance resource generation
- [ ] AuditEvent resource creation
- [ ] Inspection of Extensions for codes
- [ ] Other resource types (e.g., ImagingSelection, GenomicStudy, FamilyMemberHistory)
- [ ] Inspection of Narrative and attachments
- [ ] Support for complex combinations of codes (AND/OR logic)
- [ ] PATCH support for batch updates
- [ ] IndexedDB for larger datasets
- [ ] Service Worker for offline capability
- [ ] Bulk data processing support
- [ ] Custom rule editor UI
- [ ] Integration examples with EHR systems
- [ ] Python/Node.js backend versions

---

**Note**: This is a reference implementation for educational and prototyping purposes. For production use, consider security hardening, performance optimization, and integration with proper authentication/authorization systems.

---

## 🤖 AI-Generated Development

This project showcases the capabilities of **GitHub Copilot (Claude Sonnet 4.5)** in healthcare software development. Using **Visual Studio Code** as the IDE, the entire implementation—including:

- ✨ FHIR resource processing logic
- ✨ Security labeling algorithms
- ✨ REST API backend (Express.js)
- ✨ SQLite database integration
- ✨ Docker containerization
- ✨ Frontend UI with enhanced sample data demonstrating:
  - Multiple topics per ValueSet (e.g., PSYTHPN, SUD, BH)
  - Codes matching multiple ValueSets
  - Copy-to-clipboard functionality
- ✨ Comprehensive documentation

...was generated through AI-assisted development using GitHub Copilot powered by Anthropic's Claude Sonnet 4.5 model. This demonstrates how advanced AI models can accelerate the development of complex healthcare interoperability solutions while maintaining code quality and adherence to industry standards (FHIR R4, US Core). Directed by John Moehrke of <a href="https://MoehrkeResearch.com">Moehrke Research LLC</a>.

### Development Environment
- **IDE**: Visual Studio Code
- **AI Assistant**: GitHub Copilot
- **AI Model**: Claude Sonnet 4.5 (Anthropic)
- **Development Time**: ~30 minutes from concept to fully documented, deployable solution
