import postgres from 'postgres';
import 'dotenv/config';

export const sql = postgres(`${process.env.ADBC_POSTGRES_CONNECTION_URI}`);
