# Government Contracts Staffing Plan Tool

This tool helps generate and manage staffing plans for government contracts by analyzing RFP documents and using AI to create detailed staffing recommendations.

## Features

- Upload and process PDF or Word documents (RFPs)
- Automatically extract tasks and subtasks
- Generate recommended labor categories
- Calculate staffing hours using bottom-up or top-down approaches
- Interactive chat interface for plan modifications
- Real-time updates and adjustments
- Data persistence with Supabase
- Easy deployment to Vercel

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up Supabase:
   - Create a new project at [supabase.com](https://supabase.com)
   - Create the following tables:
     ```sql
     -- Create staffing_plans table
     create table public.staffing_plans (
       id uuid primary key,
       created_at timestamp with time zone default timezone('utc'::text, now()) not null,
       updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
       user_id text not null,
       rfp_text text not null,
       step1_tasks jsonb,
       step2_tasks_with_lcats jsonb,
       final_staffing_plan jsonb not null
     );

     -- Create chat_messages table
     create table public.chat_messages (
       id uuid primary key default uuid_generate_v4(),
       created_at timestamp with time zone default timezone('utc'::text, now()) not null,
       staffing_plan_id uuid references public.staffing_plans(id) on delete cascade,
       role text not null check (role in ('user', 'assistant')),
       content text not null
     );

     -- Enable Row Level Security
     alter table public.staffing_plans enable row level security;
     alter table public.chat_messages enable row level security;

     -- Create policies
     create policy "Enable read access for all users" on public.staffing_plans
       for select using (true);

     create policy "Enable insert access for all users" on public.staffing_plans
       for insert with check (true);

     create policy "Enable update access for all users" on public.staffing_plans
       for update using (true);

     create policy "Enable read access for all users" on public.chat_messages
       for select using (true);

     create policy "Enable insert access for all users" on public.chat_messages
       for insert with check (true);
     ```

4. Create a `.env` file in the root directory and add your environment variables:
   ```
   # OpenAI
   OPENAI_API_KEY=your_api_key_here

   # Supabase
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

   # Vercel
   VERCEL_URL=localhost:3000
   ```

## Development

To run the development server:

```bash
npm run dev
```

## Deployment to Vercel

1. Push your code to GitHub
2. Create a new project on [Vercel](https://vercel.com)
3. Connect your GitHub repository
4. Add the following environment variables in Vercel:
   - `OPENAI_API_KEY`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Deploy!

## Usage

1. Open the application in your browser
2. Upload an RFP document (PDF or Word)
3. The system will automatically:
   - Extract tasks and subtasks
   - Recommend labor categories
   - Generate hours estimates
4. Use the chat interface to:
   - Ask questions about the staffing plan
   - Request modifications
   - Get explanations for calculations

## Technical Details

- Frontend: Next.js with TypeScript and Tailwind CSS
- Backend: Node.js with OpenAI API integration
- Database: Supabase (PostgreSQL)
- Document Processing: pdf-parse and mammoth for PDF and Word documents
- State Management: React hooks
- Styling: Tailwind CSS for responsive design
- Deployment: Vercel

## Environment Variables

- `OPENAI_API_KEY`: Your OpenAI API key (required)
- `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase anonymous key
- `VERCEL_URL`: Deployment URL (set automatically by Vercel) 