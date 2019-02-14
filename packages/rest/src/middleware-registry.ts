// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: @loopback/core
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

import {Binding, ContextView, inject} from '@loopback/context';
import {middlewareFilter, MiddlewareHandler} from './middleware';
import * as express from 'express';
import debugFactory = require('debug');
const debug = debugFactory('loopback:rest:middleware');

/**
 * A phase of express middleware
 */
export type MiddlewarePhase = {
  /**
   * Middleware phase name
   */
  phase: string;
  /**
   * Bindings for middleware within the phase
   */
  bindings: Readonly<Binding<MiddlewareHandler>>[];
};

export type MiddlewareOptions = {
  phasesByOrder: string[];
  parallel?: boolean;
};

/**
 * A context-based registry for express middleware
 */
export class MiddlewareRegistry {
  constructor(
    @inject.view(middlewareFilter)
    protected middlewareView: ContextView<MiddlewareHandler>,
    @inject('express.middleware.options', {optional: true})
    protected options: MiddlewareOptions = {
      parallel: false,
      phasesByOrder: [],
    },
  ) {}

  setPhasesByOrder(phases: string[]) {
    this.options.phasesByOrder = phases || [];
  }

  /**
   * Get middleware phases ordered by the phase
   */
  protected getMiddlewarePhasesByOrder(): MiddlewarePhase[] {
    const bindings = this.middlewareView.bindings;
    const phases = this.sortMiddlewareBindingsByPhase(bindings);
    if (debug.enabled) {
      debug(
        'Middleware phases: %j',
        phases.map(phase => ({
          phase: phase.phase,
          bindings: phase.bindings.map(b => b.key),
        })),
      );
    }
    return phases;
  }

  /**
   * Get the phase for a given middleware binding
   * @param binding Middleware binding
   */
  protected getMiddlewarePhase(
    binding: Readonly<Binding<MiddlewareHandler>>,
  ): string {
    const phase = binding.tagMap.phase || '';
    debug(
      'Binding %s is configured with middleware phase %s',
      binding.key,
      phase,
    );
    return phase;
  }

  /**
   * Sort the middleware bindings so that we can start/stop them
   * in the right order. By default, we can start other middleware before servers
   * and stop them in the reverse order
   * @param bindings Middleware bindings
   */
  protected sortMiddlewareBindingsByPhase(
    bindings: Readonly<Binding<MiddlewareHandler>>[],
  ) {
    // Phase bindings in a map
    const phaseMap: Map<
      string,
      Readonly<Binding<MiddlewareHandler>>[]
    > = new Map();
    for (const binding of bindings) {
      const phase = this.getMiddlewarePhase(binding);
      let bindingsInPhase = phaseMap.get(phase);
      if (bindingsInPhase == null) {
        bindingsInPhase = [];
        phaseMap.set(phase, bindingsInPhase);
      }
      bindingsInPhase.push(binding);
    }
    // Create an array for phase entries
    const phases: MiddlewarePhase[] = [];
    for (const [phase, bindingsInPhase] of phaseMap) {
      phases.push({phase: phase, bindings: bindingsInPhase});
    }
    // Sort the phases
    return phases.sort((p1, p2) => {
      const i1 = this.options.phasesByOrder.indexOf(p1.phase);
      const i2 = this.options.phasesByOrder.indexOf(p2.phase);
      if (i1 !== -1 || i2 !== -1) {
        // Honor the phase order
        return i1 - i2;
      } else {
        // Neither phase is in the pre-defined order
        // Use alphabetical order instead so that `1-phase` is invoked before
        // `2-phase`
        return p1.phase < p2.phase ? -1 : p1.phase > p2.phase ? 1 : 0;
      }
    });
  }

  /**
   * Create an express router that sets up registered middleware by phase
   */
  async createExpressRouter() {
    const phases = this.getMiddlewarePhasesByOrder();
    const rootRouter = express.Router();
    const middleware = await this.middlewareView.values();
    const bindings = this.middlewareView.bindings;
    for (const phase of phases) {
      // Create a child router per phase
      const phaseRouter = express.Router();
      // Add the phase router to the root
      rootRouter.use(phaseRouter);

      const bindingsInPhase = phase.bindings;
      for (const binding of bindingsInPhase) {
        const index = bindings.indexOf(binding);
        if (binding.tagMap && binding.tagMap.path) {
          // Add the middleware to the given path
          debug(
            'Adding middleware (binding: %s): %j',
            binding.key,
            binding.tagMap,
          );
          phaseRouter.use(binding.tagMap.path, middleware[index]);
        } else {
          // Add the middleware without a path
          debug('Adding middleware (binding: %s)', binding.key);
          phaseRouter.use(middleware[index]);
        }
      }
    }
    return rootRouter;
  }
}
