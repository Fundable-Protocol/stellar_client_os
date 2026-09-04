import { it, expect } from 'vitest';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { typeDefs } from './schema';
import { createResolvers } from './resolvers';

it('builds a valid schema with sequels, analytics, and grants', () => {
  const schema = makeExecutableSchema({ typeDefs, resolvers: createResolvers() });
  const queryFields = Object.keys(schema.getQueryType()?.getFields() ?? {});
  expect(queryFields).toContain('campaignSequels');
  expect(queryFields).toContain('nextInSeries');
  expect(queryFields).toContain('campaignAnalytics');
  expect(queryFields).toContain('grantPrograms');
  expect(queryFields).toContain('grantProgramSummary');
  expect(queryFields).toContain('campaignGrantAllocations');
});
