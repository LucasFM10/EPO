export interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
}

export interface Flow {
  id: string;
  folder_id: string;
  title: string;
  slug: string;
  svg_url: string | null;
  pdf_url: string | null;
  bizagi_data: Record<string, unknown> | null;
  created_at: string;
}

export interface FolderTreeNode {
  folder: Folder;
  children: FolderTreeNode[];
  flows: Flow[];
}
