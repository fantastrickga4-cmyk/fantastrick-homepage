export type Review = {
  id: string;
  theme_id: string;
  theme_name: string;
  name: string;
  phone: string;
  rating: number;
  body: string;
  source?: string | null;
  created_at: string;
};
