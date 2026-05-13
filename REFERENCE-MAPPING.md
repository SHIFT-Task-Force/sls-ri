# Clinical Resources - Reference Mapping Analysis

## Scope: Clinical Resources with Potential References to Encounter, EpisodeOfCare, or Condition

Resources in SUPPORTED_RESOURCES:
- AllergyIntolerance, Condition, Procedure, Immunization, MedicationRequest, Medication, CarePlan, CareTeam, Goal, Observation, DiagnosticReport, DocumentReference, QuestionnaireResponse, Specimen, Encounter, EpisodeOfCare, ServiceRequest

---

## Detailed Reference Analysis

### ✅ OBSERVATION
**Elements with References:**
- **`encounter`** (0..1): Reference(Encounter) → Encounter ✅ IMPLEMENTED
- **`reason`** (0..*): CodeableReference array → Can reference Condition ✅ IMPLEMENTED (added in latest update)
- `basedOn`: Reference to CarePlan, MedicationRequest, ServiceRequest, etc. (doesn't propagate downward)
- `partOf`: Reference to MedicationAdministration, MedicationDispense, Procedure, Immunization, ImagingStudy, GenomicStudy (doesn't match targets)
- `derivedFrom`: Reference to DocumentReference, ImagingStudy, QuestionnaireResponse, Observation, MolecularSequence, GenomicStudy (doesn't match targets)
- `hasMember`: Reference to Observation, QuestionnaireResponse, MolecularSequence (doesn't match targets)

**Propagation Targets Found:**
- Encounter (via `encounter`)
- Condition (via `reason[]`)

---

### ✅ PROCEDURE
**Elements with References:**
- **`encounter`** (0..1): Reference(Encounter) → Encounter ✅ NEED TO VERIFY IMPLEMENTATION
- **`reason`** (0..*): CodeableReference → Can reference Condition, Observation, Procedure, DiagnosticReport, DocumentReference ✅ NEED TO IMPLEMENT
- `basedOn`: Reference to CarePlan, ServiceRequest (doesn't propagate downward)
- `partOf`: Reference to Procedure, Observation, MedicationAdministration (doesn't match targets)
- `complication`: CodeableReference to Condition (codeable part, reference part is Condition)

**Propagation Targets Found:**
- Encounter (via `encounter`)
- Condition (via `reason[]`, potentially via `complication`)

---

### ✅ DIAGNOSTIC REPORT
**Elements with References:**
- **`encounter`** (0..1): Reference(Encounter) → Encounter ✅ NEED TO VERIFY IMPLEMENTATION
- `basedOn`: Reference to CarePlan, MedicationRequest, ServiceRequest, ImmunizationRecommendation, NutritionOrder (doesn't propagate downward)
- `result`: Reference to Observation (doesn't match targets)
- `study`: Reference to GenomicStudy, ImagingStudy (doesn't match targets)

**Propagation Targets Found:**
- Encounter (via `encounter`)
- *No direct Condition or EpisodeOfCare references*

---

### ✅ MEDICATION REQUEST
**Elements with References:**
- **`encounter`** (0..1): Reference(Encounter) → Encounter ✅ NEED TO VERIFY IMPLEMENTATION
- **`reason`** (0..*): CodeableReference → Can reference Condition, Observation ✅ NEED TO IMPLEMENT
- `basedOn`: Reference to CarePlan, MedicationRequest, ServiceRequest, ImmunizationRecommendation (doesn't propagate downward)

**Propagation Targets Found:**
- Encounter (via `encounter`)
- Condition (via `reason[]`)

---

### ✅ SERVICE REQUEST
**Elements with References:**
- **`encounter`** (0..1): Reference(Encounter) → Encounter ✅ NEED TO VERIFY IMPLEMENTATION
- **`reason`** (0..*): CodeableReference → Can reference Condition, Observation, DiagnosticReport, DocumentReference, DetectedIssue ✅ NEED TO IMPLEMENT
- `basedOn`: Reference to CarePlan, ServiceRequest, MedicationRequest (doesn't propagate downward)
- `focus`: Reference(Any) → Can potentially include Condition

**Propagation Targets Found:**
- Encounter (via `encounter`)
- Condition (via `reason[]`, potentially via `focus`)

---

### ✅ CAREPLAN
**Elements with References:**
- **`encounter`** (0..1): Reference(Encounter) → Encounter ✅ NEED TO VERIFY IMPLEMENTATION
- **`addresses`** (0..*): CodeableReference to Condition → Condition ✅ NEED TO IMPLEMENT
- `goal`: Reference to Goal (doesn't match targets)
- `activity.plannedActivityReference`: References to various request resources

**Propagation Targets Found:**
- Encounter (via `encounter`)
- Condition (via `addresses[]`)

---

## Resources NOT Requiring Implementation

### ALLERGYINTOLERANCE
No encounter, EpisodeOfCare, or Condition references. Not relevant for propagation.

### CONDITION
Meta-resource - typically a target, not a source for propagation.

### IMMUNIZATION
No encounter references found. Not relevant for propagation.

### MEDICATION
No encounter references. Typically referenced by other resources.

### CARETEAM
No encounter or Condition references. Not relevant for propagation.

### GOAL
No encounter or Condition references. Not relevant for propagation.

### DOCUMENT REFERENCE
No encounter, EpisodeOfCare, or Condition references. Not relevant for propagation.

### QUESTIONNAIRE RESPONSE
No encounter, EpisodeOfCare, or Condition references. Not relevant for propagation.

### SPECIMEN
No encounter, EpisodeOfCare, or Condition references. Not relevant for propagation.

### EPISODE OF CARE
Meta-resource - typically a target, not a source.

### ENCOUNTER
Meta-resource - typically a target, not a source.

---

## Summary of Missing Implementations

| Resource | Field | Type | Target | Status |
|----------|-------|------|--------|--------|
| Procedure | `encounter` | Reference | Encounter | ❓ VERIFY |
| Procedure | `reason[]` | CodeableReference | Condition | ⚠️ TODO |
| DiagnosticReport | `encounter` | Reference | Encounter | ❓ VERIFY |
| MedicationRequest | `encounter` | Reference | Encounter | ❓ VERIFY |
| MedicationRequest | `reason[]` | CodeableReference | Condition | ⚠️ TODO |
| ServiceRequest | `encounter` | Reference | Encounter | ❓ VERIFY |
| ServiceRequest | `reason[]` | CodeableReference | Condition | ⚠️ TODO |
| ServiceRequest | `focus` | Reference(Any) | Condition | ⚠️ TODO |
| CarePlan | `encounter` | Reference | Encounter | ❓ VERIFY |
| CarePlan | `addresses[]` | CodeableReference | Condition | ⚠️ TODO |

---

## Implementation Priorities

### Priority 1 (Core Event Resources with Encounter)
These are clinical observations/events that naturally occur within an encounter:
- ✅ Observation - DONE
- ⚠️ Procedure - ADD `encounter` + `reason[]`
- ⚠️ DiagnosticReport - ADD `encounter`
- ⚠️ MedicationRequest - ADD `encounter` + `reason[]`
- ⚠️ ServiceRequest - ADD `encounter` + `reason[]` + potentially `focus`

### Priority 2 (Care Planning Resources)
- ⚠️ CarePlan - ADD `encounter` + `addresses[]`

### Priority 3 (Codeable References - Already Partially Implemented)
The `reason` field pattern is now established via Observation.reason. Should be consistently applied to:
- Procedure
- MedicationRequest
- ServiceRequest
- DiagnosticReport (may not have reason)

---

## Code Pattern for Additional Implementations

```javascript
// Add these to getPropagationTargetsFromResource() for each resource type:

// For resources with encounter reference
if (resource && resource.encounter && resource.encounter.reference) {
    targets.push({ resourceType: 'Encounter', reference: resource.encounter.reference });
}

// For resources with reason array (CodeableReference)
if (resource && Array.isArray(resource.reason)) {
    for (const reasonItem of resource.reason) {
        if (reasonItem && reasonItem.reference) {
            const refMatch = reasonItem.reference.match(/^([^/]+)\/([^/]+)$/);
            if (refMatch && refMatch[1] === 'Condition') {
                targets.push({ resourceType: 'Condition', reference: reasonItem.reference });
            }
        }
    }
}

// For resources with addresses array (CarePlan)
if (resource && Array.isArray(resource.addresses)) {
    for (const addressItem of resource.addresses) {
        if (addressItem && addressItem.reference) {
            const refMatch = addressItem.reference.match(/^([^/]+)\/([^/]+)$/);
            if (refMatch && refMatch[1] === 'Condition') {
                targets.push({ resourceType: 'Condition', reference: addressItem.reference });
            }
        }
    }
}
```

---

## Notes

1. **CodeableReference Pattern**: FHIR R5 uses CodeableReference which can contain either a code (concept) or a reference. Current implementation extracts references.

2. **EpisodeOfCare References**: Only Encounter directly references EpisodeOfCare. Most clinical resources reference Encounter first, then Encounter references EpisodeOfCare. This hierarchical flow is already implemented.

3. **Condition as Both Source and Target**: Condition can be both:
   - **Target** (receives propagated tags) - when referenced by other resources
   - **Source** (provides propagated tags) - when another resource's clinical finding relates to it

4. **Focus Field**: ServiceRequest.focus allows "Any" resource type, but typically used for patient, group, or RelatedPerson as the focus of the request. Condition would be unusual here, marked as lower priority.
