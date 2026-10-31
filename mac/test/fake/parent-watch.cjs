setInterval(() => process.ppid === 1 && process.exit(1), 200).unref()
