#!/usr/bin/env bash

# package.sh - Shortcut per generare il pacchetto ZIP di FlowTrace Recorder
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
node "$DIR/scripts/package.js" "$@"
