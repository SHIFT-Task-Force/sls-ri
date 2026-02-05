# FHIR Conformance Resources

This document describes the FHIR conformance resources for the Security Labeling Service.

These FHIR definitions are available in [SHIFT SLS-RI Implementation Guide](https://build.fhir.org/ig/SHIFT-Task-Force/sls-ri-ig/branches/main/index.html)

## CapabilityStatement

The CapabilityStatement describes the server's capabilities, supported operations, and FHIR version.

**Resource ID**: `fhir-sls-server`

**URL**: `http://SHIFT-Task-Force.github.io/sls-ri/CapabilityStatement/fhir-sls-server`

**Access**: `GET [base]/metadata`

### Key Capabilities

- **FHIR Version**: 4.0.1
- **Implementation Guide**: US Core
- **Format Support**: `application/fhir+json`, `json`
- **CORS**: Enabled
- **Operations**: 2 system-level operations

## OperationDefinitions

### 1. $sls-load-valuesets

Processes ValueSet resources to establish security labeling rules.

**Resource ID**: `sls-load-valuesets`

**URL**: `http://SHIFT-Task-Force.github.io/sls-ri/OperationDefinition/sls-load-valuesets`

**Access**: `GET [base]/OperationDefinition/sls-load-valuesets`

**Operation Endpoint**: `POST [base]/$sls-load-valuesets`

**Attributes**:
- **Kind**: operation
- **System**: true (system-level operation)
- **Type**: false
- **Instance**: false
- **Affects State**: true (modifies server state by loading ValueSets)

**Parameters**:

| Name | Use | Cardinality | Type | Description |
|------|-----|-------------|------|-------------|
| bundle | in | 1..1 | Bundle | Bundle containing ValueSet resources |
| return | out | 1..1 | OperationOutcome | Success/failure status |

**Behavior**:
1. Accepts a Bundle of ValueSet resources
2. For each ValueSet:
   - Expands the ValueSet (using tx.fhir.org if no expansion present)
   - Extracts topic codes from `ValueSet.topic[]` or `ValueSet.useContext[].focus`
   - Stores code-to-topic mappings in database
3. Returns OperationOutcome with processing summary

**Multiple Topics Support**: When a ValueSet has multiple focus contexts, all topic codes are extracted and associated with the expansion codes. This allows a single code to trigger multiple security labels.

### 2. $security-label

Analyzes resources for sensitive information and applies security labels.

**Resource ID**: `security-label`

**URL**: `http://SHIFT-Task-Force.github.io/sls-ri/OperationDefinition/security-label`

**Access**: `GET [base]/OperationDefinition/security-label`

**Operation Endpoint**: `POST [base]/$security-label?mode={batch|full}`

**Attributes**:
- **Kind**: operation
- **System**: true (system-level operation)
- **Type**: false
- **Instance**: false
- **Affects State**: false (read-only operation)

**Parameters**:

| Name | Use | Cardinality | Type | Description |
|------|-----|-------------|------|-------------|
| bundle | in | 1..1 | Bundle | Bundle containing clinical resources to analyze |
| mode | in | 0..1 | code | Output mode: `batch` or `full` (default: batch) |
| return | out | 1..1 | Bundle | Analyzed resources with security labels |

**Behavior**:

1. Receives a Bundle of clinical resources
2. For each resource:
   - Recursively searches all `code`, `coding`, and `codeableConcept` elements
   - Matches codes against database rules
   - Skips resources with `lastSourceSync` extension timestamp > earliest ValueSet date
3. For matching resources:
   - Applies `confidentialityCode` = `R` (restricted)
   - Applies topic-specific security labels from matched codes
   - Adds `lastSourceSync` extension with current timestamp
4. Returns Bundle based on mode:
   - **batch mode**: Returns Batch Bundle with only modified resources and update actions
   - **full mode**: Returns complete Bundle preserving original Bundle.id and type, containing all resources

**Multiple Labels**: When a code matches multiple ValueSets or a ValueSet with multiple topics, all applicable security labels are applied to the resource.

## Resource Cross-References

### Supported Resource Types for Analysis

The `$security-label` operation supports the following FHIR resource types (from US Core / USCDI v4):

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

### Security Label Value Sets

Security labels applied by this service use codes from:

- **Confidentiality**: [v3-Confidentiality](http://terminology.hl7.org/ValueSet/v3-Confidentiality) - Code `R` (restricted)
- **Sensitivity**: [v3-ActCode](http://terminology.hl7.org/CodeSystem/v3-ActCode) - Topic codes defined in input ValueSets

Common sensitivity codes include:
- `PSY` - Psychiatry
- `PSYTHPN` - Psychotherapy Note
- `SUD` - Substance Use Disorder
- `ETH` - Substance Abuse Information
- `BH` - Behavioral Health
- `HIV` - HIV/AIDS Information
- `STD` - Sexually Transmitted Disease

## Database Schema

The service maintains an internal SQLite database with the following structure:

### Tables

#### valuesets
Stores processed ValueSet metadata

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PRIMARY KEY | ValueSet.id |
| url | TEXT | ValueSet.url |
| version | TEXT | ValueSet.version |
| effective_date | TEXT | ValueSet.date or expansion.timestamp |
| loaded_at | TEXT | Timestamp when loaded |

#### rules
Stores code-to-topic mappings (supports multiple topics per code)

| Column | Type | Description |
|--------|------|-------------|
| code_key | TEXT | Format: `system|code` |
| topic_code | TEXT | Security label code |
| topic_system | TEXT | Security label system |
| topic_display | TEXT | Human-readable topic name |
| created_at | TEXT | Timestamp |
| PRIMARY KEY | (code_key, topic_code, topic_system) | Composite key |

**Composite Primary Key**: The `(code_key, topic_code, topic_system)` composite key allows the same code to map to multiple topics, which is essential for ValueSets with multiple focus contexts.

#### metadata
Stores system-level metadata

| Column | Type | Description |
|--------|------|-------------|
| key | TEXT PRIMARY KEY | Metadata key |
| value | TEXT | Metadata value |
| updated_at | TEXT | Last update timestamp |

Stores:
- `earliest_valueset_date`: Used to determine which resources need re-analysis

## Compliance and Standards

### FHIR R4 Compliance

- Operations follow [FHIR Operations Framework](http://hl7.org/fhir/R4/operations.html)
- Uses standard FHIR data types (Bundle, ValueSet, OperationOutcome)
- Security labels use standard FHIR `meta.security` element
- Follows FHIR RESTful API patterns

### HL7 Security Labeling Service

This implementation is inspired by the [HL7 Security Labeling Service (SLS) specification](https://www.hl7.org/implement/standards/product_brief.cfm?product_id=345), adapted for FHIR R4.

### US Core Implementation Guide

Prioritizes support for clinical resources defined in [US Core](http://hl7.org/fhir/us/core/) based on USCDI v4.

## API Examples

### Complete Workflow Example

> **Note**: The examples below are simplified for clarity. The SLS web interface at http://localhost:3000 provides "Load Sample ValueSet Bundle" and "Load Sample Resource Bundle" buttons with more comprehensive examples demonstrating multiple topics per ValueSet, cross-ValueSet matching, and other advanced features.

#### Step 1: Check Server Capabilities

```bash
GET http://localhost:3000/metadata
Accept: application/fhir+json
```

#### Step 2: Load ValueSets

```bash
POST http://localhost:3000/$sls-load-valuesets
Content-Type: application/fhir+json

{
  "resourceType": "Bundle",
  "type": "collection",
  "entry": [
    {
      "resource": {
        "resourceType": "ValueSet",
        "id": "sensitive-mental-health",
        "url": "http://example.org/ValueSet/sensitive-mental-health",
        "date": "2026-01-01T00:00:00Z",
        "useContext": [
          {
            "code": {
              "system": "http://terminology.hl7.org/CodeSystem/usage-context-type",
              "code": "focus"
            },
            "valueCodeableConcept": {
              "coding": [{
                "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
                "code": "PSY",
                "display": "Psychiatry"
              }]
            }
          }
        ],
        "expansion": {
          "timestamp": "2026-01-01T00:00:00Z",
          "contains": [
            {
              "system": "http://snomed.info/sct",
              "code": "35489007",
              "display": "Depressive disorder"
            }
          ]
        }
      }
    }
  ]
}
```

#### Step 3: Analyze Resources

```bash
POST http://localhost:3000/$security-label?mode=full
Content-Type: application/fhir+json

{
  "resourceType": "Bundle",
  "type": "collection",
  "id": "patient-bundle-123",
  "entry": [
    {
      "resource": {
        "resourceType": "Condition",
        "id": "condition-1",
        "code": {
          "coding": [{
            "system": "http://snomed.info/sct",
            "code": "35489007",
            "display": "Depressive disorder"
          }]
        },
        "subject": {
          "reference": "Patient/example"
        }
      }
    }
  ]
}
```

Response includes the resource with applied security labels:

```json
{
  "resourceType": "Bundle",
  "id": "patient-bundle-123",
  "type": "collection",
  "meta": {
    "security": [
      {
        "system": "http://terminology.hl7.org/CodeSystem/v3-Confidentiality",
        "code": "R",
        "display": "restricted"
      },
      {
        "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
        "code": "PSY",
        "display": "Psychiatry"
      }
    ]
  },
  "entry": [
    {
      "resource": {
        "resourceType": "Condition",
        "id": "condition-1",
        "meta": {
          "security": [
            {
              "system": "http://terminology.hl7.org/CodeSystem/v3-Confidentiality",
              "code": "R"
            },
            {
              "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
              "code": "PSY",
              "display": "Psychiatry"
            }
          ],
          "extension": [{
            "url": "http://hl7.org/fhir/StructureDefinition/lastSourceSync",
            "valueDateTime": "2026-02-05T20:45:00Z"
          }]
        },
        "code": {
          "coding": [{
            "system": "http://snomed.info/sct",
            "code": "35489007",
            "display": "Depressive disorder"
          }]
        },
        "subject": {
          "reference": "Patient/example"
        }
      }
    }
  ]
}
```

## Testing

You can test the operations using:

1. **Web UI**: http://localhost:3000
2. **cURL**:
   ```bash
   curl -X POST http://localhost:3000/$sls-load-valuesets \
     -H "Content-Type: application/fhir+json" \
     -d @valueset-bundle.json
   ```
3. **Postman**: Import the CapabilityStatement to generate requests
4. **FHIR Tooling**: Use [HAPI FHIR](https://hapifhir.io/) or similar libraries

## File Locations

- **CapabilityStatement**: `backend/CapabilityStatement-fhir-sls-server.json`
- **OperationDefinition ($sls-load-valuesets)**: `backend/OperationDefinition-sls-load-valuesets.json`
- **OperationDefinition ($security-label)**: `backend/OperationDefinition-security-label.json`
- **Server Implementation**: `backend/server.js`
- **Core Service Logic**: `backend/fhir-sls-service.js`

## Version History

- **v1.0.0** (2026-02-05): Initial release with FHIR operations support
  - `$sls-load-valuesets` operation
  - `$security-label` operation with batch/full modes
  - CapabilityStatement and OperationDefinitions
  - Multiple topics per ValueSet support
  - Composite primary key database schema
