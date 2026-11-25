# Foundation review checklist

Before production use, complete and record these checks:

- [ ] Apply migrations to a new, dedicated Supabase project only.
- [ ] Confirm no connection to HR or other existing Blue Line projects.
- [ ] Run SQL syntax and migration tests against the target PostgreSQL version.
- [ ] Verify an employee can see and update only permitted cases.
- [ ] Verify one employee cannot read another employee's cases or private documents unless explicitly authorized by role/policy.
- [ ] Verify manager/admin permissions separately from employee permissions.
- [ ] Verify case number uniqueness and generation under concurrent inserts.
- [ ] Verify country, visa type, workflow, and stage consistency constraints.
- [ ] Verify every stage transition records an immutable history entry.
- [ ] Verify finance edits are restricted to authorized roles.
- [ ] Verify payment currency and amount validation; prevent unauthorized payment deletion.
- [ ] Verify activity history cannot be altered by ordinary users.
- [ ] Verify the document bucket is private and object access is checked against case permissions.
- [ ] Verify signed URLs expire and are not logged or shared publicly.
- [ ] Verify WhatsApp messages are sent only with recorded consent and approved templates.
- [ ] Verify notification retries, duplicate prevention, and failure logging.
- [ ] Verify backup and restore procedure.
- [ ] Do not import real customer data until all security and acceptance checks pass.
