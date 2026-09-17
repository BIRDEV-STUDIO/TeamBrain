# Privacy

TeamBrain stores events on the local filesystem chosen by the user. The dashboard loads its assets locally, collects no telemetry, and invokes no AI provider. Explicit CLI Git pull/push commands contact the configured remote and share committed repository content, not just selected events. Automatic background synchronization is not implemented.

The `publish` command requires `--privacy-reviewed true` and creates a pending receipt only. Users must remove personal notes, secrets, credentials, customer data, and raw conversation content before review. AvenoxBeyin data is never read implicitly; imports must be explicitly exported and selected.

Future AI and relay integrations must be disabled by default, declare every data transfer, and preserve a fully local mode. Do not place secrets, credentials, or unredacted customer data in memory events.
