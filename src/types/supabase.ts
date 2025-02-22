export interface StaffingPlan {
  id: string;
  created_at: string;
  updated_at: string;
  user_id: string;
  rfp_text: string;
  step1_tasks: any;
  step2_tasks_with_lcats: any;
  final_staffing_plan: {
    tasks: {
      taskId: string;
      lcat: string;
      hours: number;
      mathRationale: string;
      basis: string;
    }[];
  };
}

export interface ChatMessage {
  id: string;
  created_at: string;
  staffing_plan_id: string;
  role: 'user' | 'assistant';
  content: string;
}

export type Database = {
  public: {
    Tables: {
      staffing_plans: {
        Row: StaffingPlan;
        Insert: Omit<StaffingPlan, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<StaffingPlan, 'id' | 'created_at' | 'updated_at'>>;
      };
      chat_messages: {
        Row: ChatMessage;
        Insert: Omit<ChatMessage, 'id' | 'created_at'>;
        Update: Partial<Omit<ChatMessage, 'id' | 'created_at'>>;
      };
    };
  };
}; 