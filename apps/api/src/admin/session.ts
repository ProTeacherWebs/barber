import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import type { FastifyReply, FastifyRequest } from "fastify";
import { hash, verify } from "@node-rs/argon2";
import { ApiError } from "../http";
import { prisma } from "../prisma";

const cookieName = "kromka_admin";
const maxAgeSec = 14 * 24 * 60 * 60;

const argon = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string) {
  return hash(password, argon);
}

export async function checkPassword(password: string, passwordHash: string) {
  if (passwordHash.startsWith("$2")) return bcrypt.compare(password, passwordHash);
  return verify(passwordHash, password);
}

function readCookie(header: string | undefined) {
  if (!header) return null;
  const part = header
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${cookieName}=`));
  if (!part) return null;
  return decodeURIComponent(part.slice(cookieName.length + 1));
}

export function setSessionCookie(reply: FastifyReply, token: string) {
  reply.header("set-cookie", `${cookieName}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSec}`);
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.header("set-cookie", `${cookieName}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}

export async function openSession(adminId: string) {
  const token = randomBytes(32).toString("base64url");
  await prisma.adminSession.deleteMany({ where: { adminId, expiresAt: { lt: new Date() } } });
  await prisma.adminSession.create({
    data: {
      id: randomUUID(),
      tokenHash: hashToken(token),
      adminId,
      expiresAt: new Date(Date.now() + maxAgeSec * 1000),
    },
  });
  return token;
}

export async function requireAdmin(request: FastifyRequest) {
  const token = readCookie(request.headers.cookie);
  if (!token) throw new ApiError(401, "UNAUTHORIZED", "Нужен вход");
  const session = await prisma.adminSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { admin: true },
  });
  if (!session || session.expiresAt.getTime() < Date.now()) {
    throw new ApiError(401, "UNAUTHORIZED", "Сессия закончилась");
  }
  return session.admin;
}

export async function closeSession(request: FastifyRequest) {
  const token = readCookie(request.headers.cookie);
  if (!token) return;
  await prisma.adminSession.deleteMany({ where: { tokenHash: hashToken(token) } });
}
