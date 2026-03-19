export type FormFieldKey =
  | "email"
  | "phone"
  | "nationality"
  | "country"
  | "summary"
  | "work_history"
  | "education"
  | "passport"
  | "seaman_book"
  | "medical";

export type FormFieldDefinition = {
  key: FormFieldKey;
  label: string;
  type: "email" | "tel" | "text" | "textarea" | "file";
};

export const FORM_FIELD_DEFINITIONS: FormFieldDefinition[] = [
  { key: "email", label: "Add email", type: "email" },
  { key: "phone", label: "Add phone number", type: "tel" },
  { key: "nationality", label: "Add nationality", type: "text" },
  { key: "country", label: "Add current country", type: "text" },
  { key: "summary", label: "Add summary", type: "textarea" },
  { key: "work_history", label: "Add work history", type: "textarea" },
  { key: "education", label: "Add education", type: "textarea" },
  { key: "passport", label: "Collect passport", type: "file" },
  { key: "seaman_book", label: "Collect seaman book", type: "file" },
  { key: "medical", label: "Collect medical", type: "file" },
];

export const FORM_FIELD_KEYS = FORM_FIELD_DEFINITIONS.map((field) => field.key);

export const FORM_FIELD_MAP = new Map(
  FORM_FIELD_DEFINITIONS.map((field) => [field.key, field])
);

export const FORM_FILE_FIELDS = new Set(
  FORM_FIELD_DEFINITIONS.filter((field) => field.type === "file").map(
    (field) => field.key
  )
);
