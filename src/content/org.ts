// Facts about the company running the service, for the trust centre and the
// generated documents. Each comes from an environment variable. Anything not
// yet decided stays a visible placeholder: we never invent a company number,
// a registration or a hosting region.
import { appName } from "@/config";

export type Fact = { value: string } | { missing: string };

function fact(name: string, missing: string): Fact {
  const v = process.env[name]?.trim();
  return v ? { value: v } : { missing };
}

export function org() {
  return {
    product: appName,
    company: fact("COMPANY_NAME", "company name"),
    companyNumber: fact("COMPANY_NUMBER", "company registration number"),
    address: fact("COMPANY_ADDRESS", "registered address"),
    icoRegistration: fact("ICO_REGISTRATION_NUMBER", "ICO registration number"),
    privacyContact: fact("PRIVACY_CONTACT_EMAIL", "privacy contact email"),
    supportContact: fact("SUPPORT_EMAIL", "support email"),
    hostingProvider: fact("HOSTING_PROVIDER", "hosting provider"),
    hostingRegion: fact("HOSTING_REGION", "hosting region (UK or EU)"),
    storageProvider: fact("STORAGE_PROVIDER", "object storage provider"),
    storageRegion: fact("STORAGE_REGION", "object storage region (UK or EU)"),
    dpaSignatory: fact("DPA_SIGNATORY", "name and role of the person who signs data processing agreements"),
    cyberInsurance: fact("CYBER_INSURANCE", "cyber insurance cover"),
  };
}

export type Org = ReturnType<typeof org>;

export const isMissing = (f: Fact): f is { missing: string } => "missing" in f;
