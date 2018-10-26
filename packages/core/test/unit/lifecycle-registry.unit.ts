// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: @loopback/core
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

import {expect} from '@loopback/testlab';
import {Context, BindingScope} from '@loopback/context';
import {
  LifeCycleObserverRegistry,
  Server,
  LifeCycleObserver,
  CoreTags,
  asLifeCycleObserverBinding,
} from '../..';

describe('lifecycle registry', () => {
  let ctx: Context;
  let lifecycle: LifeCycleObserverRegistry;
  beforeEach(givenObserverRegistry);

  it('finds servers as life cycle observers', () => {
    givenServerBinding('servers.FakeServer');
    const bindings = lifecycle.findObserverBindings();
    expect(bindings.map(b => b.key)).to.containEql('servers.FakeServer');
  });

  it('finds life cycle observers by tag', () => {
    ctx
      .bind('my-observer')
      .toClass(MyObserver)
      .apply(asLifeCycleObserverBinding);
    const bindings = lifecycle.findObserverBindings();
    expect(bindings.map(b => b.key)).to.containEql('my-observer');
  });

  it('sorts servers as last group by default', () => {
    givenServerBinding('server-1', 'server');
    givenServerBinding('server-2');
    givenObserverBinding('my-observer-1', 'g1');
    givenObserverBinding('my-observer-2', 'g2');
    givenObserverBinding('my-observer-3');

    const groups = getObserverGroups();
    expect(groups).to.containEql({group: 'g1', keys: ['my-observer-1']});
    expect(groups).to.containEql({group: 'g2', keys: ['my-observer-2']});
    expect(groups).to.containEql({group: '', keys: ['my-observer-3']});
    expect(groups).to.containEql({
      group: 'server',
      keys: ['server-1', 'server-2'],
    });
    expect(groups[3]).to.eql({
      group: 'server',
      keys: ['server-1', 'server-2'],
    });
  });

  it('sorts life cycle observers by group', () => {
    lifecycle.setGroupsByOrder(['g1', 'g2']);
    givenObserverBinding('my-observer-1', 'g1');
    givenObserverBinding('my-observer-2', 'g2');
    givenObserverBinding('my-observer-3', 'g1');

    const groups = getObserverGroups();
    expect(groups).to.eql([
      {group: 'g1', keys: ['my-observer-1', 'my-observer-3']},
      {group: 'g2', keys: ['my-observer-2']},
    ]);
  });

  it('sorts life cycle observers by group alphabetically if not predefined', () => {
    lifecycle.setGroupsByOrder(['g1', 'g2']);
    givenObserverBinding('my-observer-1', 'g1');
    givenObserverBinding('my-observer-2', 'g2');

    givenObserverBinding('my-observer-4', '2-custom-group');
    givenObserverBinding('my-observer-3', '1-custom-group');

    const groups = getObserverGroups();
    expect(groups).to.eql([
      // Custom groups come before pre-defined groups
      // Custom groups are sorted alphabetically
      {group: '1-custom-group', keys: ['my-observer-3']},
      {group: '2-custom-group', keys: ['my-observer-4']},
      {group: 'g1', keys: ['my-observer-1']},
      {group: 'g2', keys: ['my-observer-2']},
    ]);
  });

  it('starts/stops all registered life cycle observers by order', async () => {
    const events: string[] = [];
    class MockObserver implements LifeCycleObserver {
      constructor(private name: string) {}

      start() {
        events.push(`start-${this.name}`);
      }
      stop() {
        events.push(`stop-${this.name}`);
      }
    }

    lifecycle.setGroupsByOrder(['g1', 'g2', 'server']);

    ctx
      .bind('my-observer-2')
      .to(new MockObserver('2'))
      .tag({[CoreTags.LIFE_CYCLE_OBSERVER_GROUP]: 'g2'})
      .apply(asLifeCycleObserverBinding);

    ctx
      .bind('my-observer-1')
      .to(new MockObserver('1'))
      .tag({[CoreTags.LIFE_CYCLE_OBSERVER_GROUP]: 'g1'})
      .apply(asLifeCycleObserverBinding);

    // Add a server
    ctx
      .bind('my-server')
      .to(new MockObserver('server'))
      .tag(CoreTags.SERVER)
      .apply(asLifeCycleObserverBinding);

    await lifecycle.start();
    expect(events).to.eql(['start-1', 'start-2', 'start-server']);
    await lifecycle.stop();
    expect(events).to.eql([
      'start-1',
      'start-2',
      'start-server',
      'stop-server',
      'stop-2',
      'stop-1',
    ]);
  });

  it('allows pre/post events', async () => {
    const events: string[] = [];
    class MockObserver implements LifeCycleObserver {
      constructor(private name: string) {}

      preStart() {
        events.push(`preStart-${this.name}`);
      }

      start() {
        events.push(`start-${this.name}`);
      }

      postStart() {
        events.push(`postStart-${this.name}`);
      }

      preStop() {
        events.push(`preStop-${this.name}`);
      }

      stop() {
        events.push(`stop-${this.name}`);
      }

      postStop() {
        events.push(`postStop-${this.name}`);
      }
    }

    lifecycle.setGroupsByOrder(['g1', 'g2']);

    ctx
      .bind('my-observer-1')
      .to(new MockObserver('1'))
      .tag({[CoreTags.LIFE_CYCLE_OBSERVER_GROUP]: 'g1'})
      .apply(asLifeCycleObserverBinding);

    ctx
      .bind('my-observer-2')
      .to(new MockObserver('2'))
      .tag({[CoreTags.LIFE_CYCLE_OBSERVER_GROUP]: 'g2'})
      .apply(asLifeCycleObserverBinding);

    await lifecycle.start();
    expect(events).to.eql([
      'preStart-1',
      'preStart-2',
      'start-1',
      'start-2',
      'postStart-1',
      'postStart-2',
    ]);
    await lifecycle.stop();
    expect(events).to.eql([
      'preStart-1',
      'preStart-2',
      'start-1',
      'start-2',
      'postStart-1',
      'postStart-2',
      'preStop-2',
      'preStop-1',
      'stop-2',
      'stop-1',
      'postStop-2',
      'postStop-1',
    ]);
  });

  function givenObserverRegistry() {
    ctx = new Context('context-with-lifecycle');
    lifecycle = new LifeCycleObserverRegistry(ctx);
  }

  function getObserverGroups() {
    const groups = lifecycle.getObserverGroupsByOrder();
    return groups.map(g => ({
      group: g.group,
      keys: g.bindings.map(b => b.key),
    }));
  }

  function givenObserverBinding(key: string, group?: string) {
    const binding = ctx
      .bind(key)
      .toClass(MyObserver)
      .apply(asLifeCycleObserverBinding);
    if (group) {
      binding.tag({[CoreTags.LIFE_CYCLE_OBSERVER_GROUP]: group});
    }
    return binding;
  }

  function givenServerBinding(key: string, group?: string) {
    const serverBinding = ctx
      .bind(key)
      .toClass(FakeServer)
      .tag(CoreTags.SERVER, CoreTags.LIFE_CYCLE_OBSERVER)
      .inScope(BindingScope.SINGLETON);
    if (group) {
      serverBinding.tag({[CoreTags.LIFE_CYCLE_OBSERVER_GROUP]: group});
    }
    return serverBinding;
  }

  class FakeServer extends Context implements Server {
    listening: boolean = false;
    constructor() {
      super();
    }
    async start(): Promise<void> {
      this.listening = true;
    }

    async stop(): Promise<void> {
      this.listening = false;
    }
  }

  class MyObserver implements LifeCycleObserver {
    status = 'not-initialized';

    start() {
      this.status = 'started';
    }
    stop() {
      this.status = 'stopped';
    }
  }
});
