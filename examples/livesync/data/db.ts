import postgres from 'postgres';
import 'dotenv/config';

const sql = postgres(process.env.POSTGRES_URL as string);

export default sql;
