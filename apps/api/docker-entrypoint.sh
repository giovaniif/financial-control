#!/bin/sh
# Committed migrations are applied before the process listens, and a failure
# stops the container rather than serving requests against a schema the code
# does not expect. `migrate deploy`, never `migrate dev`: nothing here may
# author a migration.
#
# The CLI is invoked directly rather than through pnpm, which would check the
# workspace's dependencies were in step and try to install them — at runtime,
# as an unprivileged user, in an image that is already complete.
set -e

./node_modules/.bin/prisma migrate deploy
exec node dist/main.js
