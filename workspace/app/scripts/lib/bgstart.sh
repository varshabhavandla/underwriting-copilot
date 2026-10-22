# Runs a command in its own session so a group kill reaches its children. macOS has no setsid command, so fall back to perl (present on macOS and Linux).
bgstart() { if [ "${FORCE_NO_SETSID:-0}" != "1" ] && command -v setsid >/dev/null 2>&1; then setsid "$@"; else perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV or die "exec failed: $!"' -- "$@"; fi; }
