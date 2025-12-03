import mysql from 'mysql2/promise';
import dotenv from "dotenv";
dotenv.config();

// Pool global reutilizable; valores provienen de variables de entorno
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONN_LIMIT || 3)
});

export { pool };
