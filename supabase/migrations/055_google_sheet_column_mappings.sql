-- Google Sheet Column Mappings Table
-- Stores manual column mappings for Google Sheets sync
-- Each workspace can map Google Sheet columns to Orders table fields

-- Drop table if it exists to ensure clean schema
DROP TABLE IF EXISTS google_sheet_column_mappings CASCADE;

create table google_sheet_column_mappings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  sheet_column text not null, -- The column name/letter from the Google Sheet (e.g., "A", "B", "Order ID")
  order_field text not null, -- The Orders table field to map to (e.g., "customer_name", "phone")
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(workspace_id, sheet_column)
);

-- Enable RLS
alter table google_sheet_column_mappings enable row level security;

-- Policy: Users can read/write mappings for their own workspaces
create policy "Users can view own workspace mappings"
  on google_sheet_column_mappings for select
  using (
    workspace_id in (
      select workspace_id from profile_workspaces 
      where profile_id = auth.uid()
    )
  );

create policy "Users can insert own workspace mappings"
  on google_sheet_column_mappings for insert
  with check (
    workspace_id in (
      select workspace_id from profile_workspaces 
      where profile_id = auth.uid()
    )
  );

create policy "Users can update own workspace mappings"
  on google_sheet_column_mappings for update
  using (
    workspace_id in (
      select workspace_id from profile_workspaces 
      where profile_id = auth.uid()
    )
  );

create policy "Users can delete own workspace mappings"
  on google_sheet_column_mappings for delete
  using (
    workspace_id in (
      select workspace_id from profile_workspaces 
      where profile_id = auth.uid()
    )
  );

-- Index for faster lookups
create index if not exists idx_google_sheet_mappings_workspace 
  on google_sheet_column_mappings(workspace_id);

create index if not exists idx_google_sheet_mappings_sheet_column 
  on google_sheet_column_mappings(sheet_column);
