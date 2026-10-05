import 'dotenv/config';

/**
 * Resolves the database the automated tests may wipe.
 * TEST_DATABASE_URL wins; otherwise DATABASE_URL with its database renamed to
 * `<name>_test` (a trailing `_dev` is dropped first). The tests TRUNCATE every
 * table, so anything whose database name lacks "test" is refused outright.
 */
export function testDatabaseUrl() {
  const source = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!source) throw new Error('Set TEST_DATABASE_URL or DATABASE_URL before running tests');
  const url = new URL(source);
  if (!process.env.TEST_DATABASE_URL) {
    const name = url.pathname.slice(1);
    if (!name.endsWith('_test')) url.pathname = `/${name.replace(/_dev$/, '')}_test`;
  }
  if (!/test/i.test(url.pathname))
    throw new Error(`Refusing to run tests against "${url.pathname.slice(1)}": the database name must contain "test"`);
  return url.toString();
}
