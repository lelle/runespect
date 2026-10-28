<script lang="ts">
  // Writable state with siblings a whole-value edit would corrupt: a nested object, a function and
  // a class instance. `prefs` is $state.raw, which only updates when it is reassigned.
  class Session {
    token = 't1';
    renew(): string {
      return this.token;
    }
  }
  let user = $state({
    name: 'ada',
    address: { city: 'paris', geo: { lat: 49 } },
    greet: () => 'hi',
    session: new Session(),
  });
  let prefs = $state.raw({ theme: 'dark', size: 1 });
</script>

<p data-user>
  {user.name} · {user.address.city} · {user.address.geo.lat} · {user.greet()} · {user.session.renew()}
</p>
<p data-prefs>{prefs.theme} · {prefs.size}</p>
