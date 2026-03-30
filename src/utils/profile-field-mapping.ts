export interface FieldMappingResult {
  original: string;
  mapped: string | null;
  supported: boolean;
}

export const ALLOWED_PROFILE_FIELDS = [
  "givenName",
  "middleName",
  "familyName",
  "email",
  "userName",
  "avatar",
  "telephone",
  "mobileCountryCode",
  "languagePrimary",
  "languageOthers",
  "gender",
  "dateOfBirth",
  "maritalStatus",
  "education",
  "householdIncome",
  "employmentStatus",
  "employmentIndustry",
  "residenceCountry",
  "residenceProvince",
  "residenceCity",
  "first_name",
  "middle_name",
  "last_name",
  "email_address",
  "user_name",
  "mobile_number",
  "mobile_country_code",
  "date_of_birth",
  "language_primary",
  "language_others",
  "residence_country",
  "residence_province",
  "residence_city",
  "marital_status",
  "household_income",
  "employment_status",
  "employment_industry",
] as const;

const FIELD_NAME_TO_JSONPATH: Record<string, string> = {
  givenName: "$.givenName",
  middleName: "$.middleName",
  familyName: "$.familyName",
  email: "$.email",
  userName: "$.userName",
  telephone: "$.telephone",
  mobileCountryCode: "$.mobileCountryCode",
  languagePrimary: "$.languagePrimary",
  languageOthers: "$.languageOthers",
  dateOfBirth: "$.dateOfBirth",
  maritalStatus: "$.maritalStatus",
  householdIncome: "$.householdIncome",
  employmentStatus: "$.employmentStatus",
  employmentIndustry: "$.employmentIndustry",
  residenceCountry: "$.residenceCountry",
  residenceProvince: "$.residenceProvince",
  residenceCity: "$.residenceCity",
  first_name: "$.givenName",
  middle_name: "$.middleName",
  last_name: "$.familyName",
  email_address: "$.email",
  user_name: "$.userName",
  avatar: "$.avatar",
  mobile_number: "$.telephone",
  mobile_country_code: "$.mobileCountryCode",
  language_primary: "$.languagePrimary",
  language_others: "$.languageOthers",
  gender: "$.gender",
  date_of_birth: "$.dateOfBirth",
  marital_status: "$.maritalStatus",
  education: "$.education",
  household_income: "$.householdIncome",
  employment_status: "$.employmentStatus",
  employment_industry: "$.employmentIndustry",
  residence_country: "$.residenceCountry",
  residence_province: "$.residenceProvince",
  residence_city: "$.residenceCity",
  firstName: "$.givenName",
  given_name: "$.givenName",
  lastName: "$.familyName",
  family_name: "$.familyName",
  surname: "$.familyName",
  additionalName: "$.middleName",
  additional_name: "$.middleName",
  emailAddress: "$.email",
  alternateName: "$.userName",
  alternate_name: "$.userName",
  nickname: "$.userName",
  alias: "$.userName",
  username: "$.userName",
  image: "$.avatar",
  profileImage: "$.avatar",
  profile_image: "$.avatar",
  photo: "$.avatar",
  picture: "$.avatar",
  phone: "$.telephone",
  phoneNumber: "$.telephone",
  phone_number: "$.telephone",
  mobile: "$.telephone",
  mobilePhone: "$.telephone",
  mobile_phone: "$.telephone",
  language: "$.languagePrimary",
  primaryLanguage: "$.languagePrimary",
  primary_language: "$.languagePrimary",
  languages: "$.languageOthers",
  knowsLanguage: "$.languageOthers",
  knows_language: "$.languageOthers",
  spokenLanguages: "$.languageOthers",
  spoken_languages: "$.languageOthers",
  birthDate: "$.dateOfBirth",
  dob: "$.dateOfBirth",
  birthday: "$.dateOfBirth",
  educationLevel: "$.education",
  education_level: "$.education",
  income: "$.householdIncome",
  occupation: "$.employmentStatus",
  hasOccupation: "$.employmentStatus",
  has_occupation: "$.employmentStatus",
  job: "$.employmentStatus",
  work: "$.employmentStatus",
  employment: "$.employmentStatus",
  address: "$.residenceCountry",
  location: "$.residenceCountry",
  homeAddress: "$.residenceCountry",
  home_address: "$.residenceCountry",
  addressLine: "$.residenceCountry",
  address_line: "$.residenceCountry",
  country: "$.residenceCountry",
  province: "$.residenceProvince",
  city: "$.residenceCity",
};

export function getAllSupportedFieldNames(): string[] {
  const combined = new Set<string>([
    ...ALLOWED_PROFILE_FIELDS,
    ...Object.keys(FIELD_NAME_TO_JSONPATH),
  ]);
  return Array.from(combined);
}

export function mapFieldName(fieldName: string): FieldMappingResult {
  const normalized = fieldName.trim();
  const jsonPath = FIELD_NAME_TO_JSONPATH[normalized];

  if (jsonPath) {
    return {
      original: fieldName,
      mapped: jsonPath,
      supported: true,
    };
  }

  return {
    original: fieldName,
    mapped: null,
    supported: false,
  };
}

export function mapFieldNames(fieldNames: string[]): FieldMappingResult[] {
  return fieldNames.map(mapFieldName);
}
