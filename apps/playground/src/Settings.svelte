<script lang="ts">
  // A writable $state object — exercises edit-at-path (drill in and edit a nested leaf) and, in
  // the panel (lazy/depth-1 wire), lazy inspection: `profile` arrives as a dehydrated stub and is
  // fetched on expand.
  let settings = $state({
    theme: 'dark',
    size: 10,
    profile: { name: 'ada', prefs: { compact: true } },
  });
</script>

<p>theme: {settings.theme}, size: {settings.size}, who: {settings.profile.name}</p>
