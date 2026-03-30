import type { FieldMappingResult } from "./profile-field-mapping.js";
import { getContractVersion, SCRIPT_NAMES } from "./contract-version.js";

const PROFILE_SCRIPT_NAME = SCRIPT_NAMES.USER;

const JSON_PATH_TO_PROFILE_KEYS: Record<string, string[]> = {
  "$.givenName": ["givenName", "first_name"],
  "$.middleName": ["middleName", "middle_name"],
  "$.familyName": ["familyName", "last_name"],
  "$.email": ["email", "email_address"],
  "$.userName": ["userName", "user_name"],
  "$.avatar": ["avatar"],
  "$.telephone": ["telephone", "mobile_number"],
  "$.mobileCountryCode": ["mobileCountryCode", "mobile_country_code"],
  "$.languagePrimary": ["languagePrimary", "language_primary"],
  "$.languageOthers": ["languageOthers", "language_others"],
  "$.gender": ["gender"],
  "$.dateOfBirth": ["dateOfBirth", "date_of_birth"],
  "$.maritalStatus": ["maritalStatus", "marital_status"],
  "$.education": ["education"],
  "$.householdIncome": ["householdIncome", "household_income"],
  "$.employmentStatus": ["employmentStatus", "employment_status"],
  "$.employmentIndustry": ["employmentIndustry", "employment_industry"],
  "$.residenceCountry": ["residenceCountry", "residence_country"],
  "$.residenceProvince": ["residenceProvince", "residence_province"],
  "$.residenceCity": ["residenceCity", "residence_city"],
};

export async function buildProfileExecuteRequest(
  functionName: string,
  targetDid: string,
  baseUrl: string,
  input?: unknown
): Promise<Record<string, unknown>> {
  return {
    script_name: PROFILE_SCRIPT_NAME,
    script_version: await getContractVersion(baseUrl, PROFILE_SCRIPT_NAME),
    function_name: functionName,
    pii_did: targetDid,
    ...(input === undefined ? {} : { input }),
  };
}

export function parseProfileKeysResult(rawResult: string): string[] {
  try {
    const parsed = JSON.parse(rawResult) as { response?: unknown };
    const response = parsed.response;

    if (
      Array.isArray(response) &&
      response.length > 0 &&
      typeof response[0] === "number"
    ) {
      const jsonString = new TextDecoder().decode(new Uint8Array(response));
      const decoded = JSON.parse(jsonString) as unknown;
      return Array.isArray(decoded)
        ? decoded.filter((entry): entry is string => typeof entry === "string")
        : [];
    }

    if (Array.isArray(response)) {
      return response.filter((entry): entry is string => typeof entry === "string");
    }

    return [];
  } catch {
    return [];
  }
}

export function checkMappedFieldsExistence(
  profileKeys: string[],
  mappingResults: Array<FieldMappingResult & { mapped: string }>
): {
  fieldExistence: Record<string, boolean>;
  missingFields: string[];
} {
  const availableKeys = new Set(profileKeys);
  const fieldExistence: Record<string, boolean> = {};
  const missingFields: string[] = [];

  for (const result of mappingResults) {
    const candidates = JSON_PATH_TO_PROFILE_KEYS[result.mapped] ?? [
      result.mapped.replace(/^\$\./, ""),
    ];
    const exists = candidates.some((candidate) => availableKeys.has(candidate));
    fieldExistence[result.original] = exists;
    if (!exists) {
      missingFields.push(result.original);
    }
  }

  return {
    fieldExistence,
    missingFields,
  };
}
