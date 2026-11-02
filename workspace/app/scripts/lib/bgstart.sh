# Runs a command in its own session so a group kill reaches its children. macOS has no setsid command, so fall back to perl (present on macOS and Linux).
# Call it only in the background, as `bgstart cmd args > log 2>&1 & PID=$!`: it exec's, so it replaces the background subshell. That makes $! the
# PID of the session leader itself, so `kill -- -$PID` reaches the whole group. Without the exec, $! would be the subshell's PID, the group kill would
# miss, and the server's worker processes would outlive the script and interfere with the next suite.
bgstart() { if [ "${FORCE_NO_SETSID:-0}" != "1" ] && command -v setsid >/dev/null 2>&1; then exec setsid "$@"; else exec perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV or die "exec failed: $!"' -- "$@"; fi; }
