export type Stage = {
  id: string;
  name: string;
  order: number;
};

export type Pool = {
  id: string;
  name: string;
};

export type Pipeline = {
  id: string;
  name: string;
  stages: Stage[];
};

export type CandidateStatus = "active" | "archived";

export type WorkHistoryItem = {
  id: string;
  role: string;
  company: string;
  start?: string;
  end?: string;
  details?: string;
};

export type EducationItem = {
  id: string;
  program: string;
  institution: string;
  start?: string;
  end?: string;
  details?: string;
};

export type ScorecardEntry = {
  rating?: number | null;
  notes?: string;
};

export type Scorecard = {
  thoughts?: string;
  overall_rating?: number | null;
  entries?: Record<string, ScorecardEntry>;
};

export type TaskItem = {
  id: string;
  kind?: "task" | "request_info" | string | null;
  title: string;
  status: "open" | "done";
  created_at?: string;
  watcher_ids?: string[];
  completed_at?: string | null;
  completed_by?: string | null;
  assigned_to?: string | null;
  due_at?: string | null;
  reminder_minutes_before?: number | null;
  notes?: string | null;
};

export type Candidate = {
  id: string;
  name: string;
  email: string;
  start_date?: string;
  website_url?: string;
  phone?: string;
  avatar_url?: string | null;
  company_owner?: string;
  company_owner_id?: string;
  company_representative_name?: string;
  company_representative_email?: string;
  company_representative_phone?: string;
  city?: string;
  industry?: string;
  assigned_company_id?: string;
  assigned_company_name?: string;
  pipeline_id: string;
  pool_id: string;
  stage_id: string;
  country?: string;
  nationality?: string;
  status: CandidateStatus;
  created_at: string;
  updated_at: string;
  order: number;
  source?: string;
  desired_position?: string;
  availability?: string;
  salary_expectation?: string;
  mailerlite?: Record<string, unknown>;
  ai_summary_markdown?: string;
  experience_summary?: string;
  top_strengths?: string[];
  top_concerns?: string[];
  tags?: string[];
  tasks?: TaskItem[];
  work_history?: WorkHistoryItem[];
  education?: EducationItem[];
  scorecard?: Scorecard;
  questionnaires_sent?: Array<{
    id: string;
    questionnaire_id?: string;
    name: string;
    status: "Active" | "Draft";
    sent_at: string;
    sent_by?: string;
  }>;
  breezy?: {
    match_score?: string;
    score?: string;
    address?: string;
    desired_salary?: string;
    position?: string;
    stage?: string;
    source?: string;
    sourced_by?: string;
    addedDate?: string;
    addedTime?: string;
    lastActivityDate?: string;
    lastActivityTime?: string;
  };
  attachments?: Array<{
    id: string;
    name?: string;
    mime?: string;
    url?: string;
    path?: string;
    kind?: "resume" | "document";
    created_at?: string;
    created_by?: string;
  }>;
  meeting_link?: string;
  meeting_provider?: string;
  meeting_event_id?: string;
  meeting_start?: string;
  meeting_end?: string;
  meeting_timezone?: string;
  meeting_title?: string;
  meeting_interviewers?: string;
  meeting_conference_record?: string;
  meeting_recording_url?: string;
  meeting_recording_file?: string;
  meeting_recording_state?: string;
  meeting_transcript_url?: string;
  meeting_transcript_doc?: string;
  meeting_transcript_state?: string;
  meeting_transcript_excerpt?: string;
  meeting_transcript_summary?: string;
  meeting_artifacts_checked_at?: string;
  meeting_rsvp_status?: string;
  meeting_rsvp_email?: string;
  meeting_rsvp_updated_at?: string;
  meeting_created_at?: string;
  meeting_is_instant?: boolean;
};

export type Note = {
  id: string;
  candidate_id: string;
  body: string;
  created_at: string;
  author_name?: string;
  author_email?: string;
  author_id?: string;
};

export type ActivityEvent = {
  id: string;
  candidate_id: string;
  type: "move" | "note" | "system";
  body: string;
  created_at: string;
  author_name?: string;
  author_email?: string;
  author_id?: string;
};
