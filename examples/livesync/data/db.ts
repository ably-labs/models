import postgres from 'postgres';
import 'dotenv/config';

export const sql = postgres(process.env.POSTGRES_URL as string);
