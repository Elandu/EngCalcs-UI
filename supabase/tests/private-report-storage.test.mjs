import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const migration = await readFile(
  new URL("../migrations/20261010125000_private_report_storage.sql", import.meta.url), "utf8",
);

test("issued calculation storage is private and limits uploads to PDFs", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create schema storage;
      create table storage.buckets(
        id text primary key,
        name text not null,
        public boolean not null default false,
        file_size_limit bigint,
        allowed_mime_types text[]
      );
    `);
    await db.exec(migration);
    const first = (await db.query("select * from storage.buckets where id='issued-calculation-packs'")).rows[0];
    assert.equal(first.public, false);
    assert.equal(Number(first.file_size_limit), 26214400);
    assert.deepEqual(first.allowed_mime_types, ["application/pdf"]);
    await db.exec(migration);
    assert.equal((await db.query("select count(*)::int as n from storage.buckets")).rows[0].n, 1);
    await db.exec("update storage.buckets set public=true where id='issued-calculation-packs'");
    await assert.rejects(db.exec(migration), /must be private/);
  } finally {
    await db.close();
  }
});
