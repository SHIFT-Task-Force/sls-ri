# FHIR Security Labeling Service (SLS)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![FHIR](https://img.shields.io/badge/FHIR-R4-red.svg)](http://hl7.org/fhir/R4/)
[![GitHub Pages](https://img.shields.io/badge/Demo-Live-success.svg)](https://SHIFT-Task-Force.github.io/sls-ri/)

This repository contains a prototype implementation of a FHIR Security Labeling Service (SLS) designed to analyze FHIR resources for sensitive information and apply appropriate security labels based on predefined rules. This project is a Reference Implementation and the code is written for readability and not optimized. Where optimizations are possible, comments are included to indicate potential improvements for production use.

**🤖 This project was generated using GitHub Copilot** to demonstrate AI-assisted development of healthcare interoperability solutions.

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
    - Receives a FHIR Bundle holding one or more FHIR ValueSet resources, where the ValueSet resources contain codes that define sensitive categories (e.g., mental health, substance abuse, HIV status).
    - for Each ValueSet resource
        - Processes and stores these ValueSet resources to build an internal rule set for identifying sensitive information in FHIR resources.
        - Each ValueSet the expansion will hold codes from standard terminologies (e.g., SNOMED CT, LOINC, ICD-10) that correspond to sensitive topics.
        - The Sensitive topic code is indicated in the ValueSet.topic element.
    - Recording the earliest dateTime from the ValueSet.date element to determine the effective date for the sensitive categories.
    - Returning an OperationOutcome indicating success or failure of the ValueSet processing.
2. Tag a Bundle of Clinical Resources
    - Receives a FHIR Bundle holding one or more FHIR resources (e.g., Condition, Observation, MedicationStatement) to be analyzed for sensitive information.
    - Inspecting FHIR Bundle entries and processing each resource as follows:
        - If the resource.meta element has an extension `http://hl7.org/fhir/StructureDefinition/lastSourceSync`, and the valueDateTime is later than the earliest ValueSet.date; then this resource does not need to be re-analyzed and therefore is skipped and not included in the output Bundle.
        - Analyzing each resource's elements that are code, coding, or codeableConcept to identify any codes that match the internal rule set of sensitive categories.
        - For resources that contain sensitive information, applying FHIR security labels to the resource's meta.security element, including:
            - The confidentialityCode `R` (restricted)
            - Topic-specific security labels from matched sensitive categories
        - Add the lastSourceSync extension to the resource's meta element with the current dateTime.
    - Build a new FHIR Batch Bundle, with update actions for each Resource that was analyzed.
    - The output Bundle.meta.security contains distinct (deduplicated) security labels from all resources in the bundle, providing a summary of all sensitive categories present.
    - Returning the Batch Bundle as the response.

```mermaid
graph LR
  subgraph API1["API 1: Setup Sensitive Topics"]
    A[ValueSet Bundle] --> B[Load & Store ValueSets]
    B --> C[Build Internal Rule Set<br/>from expansion codes]
    C --> D[Extract ValueSet.topic]
    D --> E[Track Earliest ValueSet.date]
    E --> F[Return OperationOutcome]
  end
  
  subgraph API2["API 2: Tag Clinical Resources"]
    G[Resource Bundle] --> H{Check meta.lastSourceSync}
    H -->|Later than ValueSet.date| I[Skip - No Re-analysis]
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

## Additional Features that are not implemented but do have comments in the codebase:

- Creating Provenance resources linking labeling actions to agents or timestamps via FHIR. This would be one Provenance added to the update Bundle, with each of the updated resources referenced in the Provenance.target; and the Provenance.entity referencing a Device that represents the SLS engine.
- Creating AuditEvent resources to capture details of labeling actions, including who performed the action, what was acted upon, when it occurred, and where it took place.
- Using PATCH rather than PUT for updating resources in the output Bundle, to minimize data transfer by only sending changes.

## Getting Started

### Quick Start

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

3. **Try the Sample Data**:
   - Click "API 1: Setup Sensitive Topics"
   - Click "Load Sample ValueSet Bundle"
   - Click "Process ValueSets"
   - Switch to "API 2: Tag Clinical Resources"
   - Click "Load Sample Resource Bundle"
   - Click "Analyze & Tag Resources"

### Usage Examples

#### API 1: Loading Sensitive Topic Definitions

```json
{
  "resourceType": "Bundle",
  "type": "collection",
  "entry": [{
    "resource": {
      "resourceType": "ValueSet",
      "id": "mental-health-conditions",
      "date": "2024-01-01T00:00:00Z",
      "topic": [{
        "coding": [{
          "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
          "code": "PSY",
          "display": "Psychiatry"
        }]
      }],
      "expansion": {
        "contains": [{
          "system": "http://snomed.info/sct",
          "code": "35489007",
          "display": "Depressive disorder"
        }]
      }
    }
  }]
}
```

#### API 2: Analyzing Resources

The service analyzes resources and applies security labels:

**Input**: Bundle with clinical resources

**Output**: Batch Bundle with:
- Each resource's `meta.security` containing:
  - confidentialityCode `R` (restricted) if sensitive content detected
  - Topic-specific security labels for matched sensitive categories
  - `meta.extension` with lastSourceSync timestamp
- Bundle's `meta.security` containing:
  - Distinct (deduplicated) security labels from all resources
  - Provides at-a-glance summary of sensitive content types in the bundle

## Project Structure

```
sls-ri/
├── index.html          # Main application interface
├── fhir-sls.js         # Core FHIR processing engine
├── app.js              # UI logic and event handlers
├── styles.css          # Application styling
├── README.md           # This file
├── DEPLOYMENT.md       # Deployment guide
└── .nojekyll           # GitHub Pages configuration
```

## Technology Stack

- **Frontend**: Pure HTML5, CSS3, JavaScript (ES6+)
- **Storage**: Browser localStorage API
- **Deployment**: GitHub Pages (static hosting)
- **Standards**: FHIR R4, US Core Implementation Guide (USCDI v4)

### Why Client-Side?

This implementation runs entirely in the browser for several reasons:
- ✅ **Privacy**: No data leaves the user's browser
- ✅ **Simplicity**: No backend infrastructure required
- ✅ **Cost**: Free hosting on GitHub Pages
- ✅ **Portability**: Works offline after initial load
- ✅ **Transparency**: All code is visible and auditable

## Architecture

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

⚠️ **Storage**: localStorage limited to ~5-10MB per domain
⚠️ **Performance**: Not optimized for large datasets (100s of resources)
⚠️ **Browsers**: Requires modern browser with ES6+ support
⚠️ **Scale**: Designed for reference/demonstration, not production use

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

- [FHIR R4 Security Labels](http://hl7.org/fhir/R4/security-labels.html)
- [FHIR R4 Meta Element](http://hl7.org/fhir/R4/resource.html#Meta)
- [US Core Implementation Guide](http://hl7.org/fhir/us/core/)
- [HL7 Security Labeling Service](https://www.hl7.org/implement/standards/product_brief.cfm?product_id=345)
- [USCDI v4](https://www.healthit.gov/isa/united-states-core-data-interoperability-uscdi)

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- **SHIFT Task Force** - Project sponsorship and healthcare expertise
- **GitHub Copilot** - AI-assisted code generation and development
- **HL7 FHIR Community** - Standards development and guidance
- **US Core Contributors** - Implementation guide development

## Support & Contact

- **Issues**: [GitHub Issues](https://github.com/SHIFT-Task-Force/sls-ri/issues)
- **Discussions**: [GitHub Discussions](https://github.com/SHIFT-Task-Force/sls-ri/discussions)
- **Documentation**: See [DEPLOYMENT.md](DEPLOYMENT.md) for deployment details

## Roadmap

Potential future enhancements:

- [ ] Provenance resource generation
- [ ] AuditEvent resource creation
- [ ] PATCH support for batch updates
- [ ] IndexedDB for larger datasets
- [ ] Service Worker for offline capability
- [ ] Bulk data processing support
- [ ] Custom rule editor UI
- [ ] Integration examples with EHR systems
- [ ] Python/Node.js backend versions

---

**Note**: This is a reference implementation for educational and prototyping purposes. For production use, consider security hardening, performance optimization, and integration with proper authentication/authorization systems.
