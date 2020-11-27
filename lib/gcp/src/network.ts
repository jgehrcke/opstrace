/**
 * Copyright 2020 Opstrace, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { delay, call } from "redux-saga/effects";
//@ts-ignore: don't know the reason but have to add one now for ESLint :-).
import Compute from "@google-cloud/compute";
import { log, SECOND } from "@opstrace/utils";

class Routes extends Compute {
  constructor(options = {}) {
    super(options);
  }
  destroy(
    name: string,
    callback: (err: any, data: any) => Record<string, unknown>
  ) {
    //@ts-ignore: don't know the reason but have to add one now for ESLint :-).
    this.request(
      {
        method: "DELETE",
        uri: `/global/routes/${name}`
      },
      callback
    );
  }
  list(callback: (err: any, data: any) => void) {
    //@ts-ignore: don't know the reason but have to add one now for ESLint :-).
    this.request(
      {
        method: "GET",
        uri: `/global/routes`
      },
      callback
    );
  }
}

const getRoutes = (client: any, networkName: string) =>
  new Promise((resolve, reject) => {
    client.list((err: any, data: any) => {
      if (err) {
        reject(err);
      } else {
        resolve(
          data &&
            data.items &&
            Array.isArray(data.items) &&
            data.items.filter(
              (route: any) =>
                route.network.split("/").pop() === networkName &&
                !(
                  route.nextHopNetwork &&
                  route.nextHopNetwork.split("/").pop() === networkName
                )
            )
        );
      }
    });
  });

const destroyRoute = (client: any, name: string) =>
  new Promise((resolve, reject) => {
    client.destroy(name, (err: any, _: any) => {
      if (err) {
        reject(err);
      } else {
        resolve(true);
      }
    });
  });

const doesNetworkExist = async (
  client: any,
  { name }: { name: string }
): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    client
      .network(name)
      .exists()
      .then((data: [boolean, any]) => {
        resolve(data[0]);
      })
      .catch((err: any) => {
        reject(err);
      });
  });
};

const createNetwork = (client: any, name: string) => {
  return client.network(name).create({ autoCreateSubnetworks: false });
};

const destroyNetwork = (client: any, name: string) => {
  return new Promise((resolve, reject) => {
    client.network(name).delete((err: any, operation: any) => {
      if (err) {
        reject(err);
      }
      resolve(operation);
    });
  });
};

export interface NetworkRequest {
  name: string;
}

export function* ensureNetworkExists(networkName: string) {
  const client = new Compute();

  while (true) {
    const existingNetwork: boolean = yield call(doesNetworkExist, client, {
      name: networkName
    });

    if (!existingNetwork) {
      try {
        yield call(createNetwork, client, networkName);
      } catch (e) {
        if (e.code === 400) {
          // parent network is not yet ready
          if (e.message && e.message.includes("is not ready")) {
            log.info("retry in 5 s (%s)", e.message);
            yield delay(5 * SECOND);
            continue;
          }
        } else if (!e.code || (e.code && e.code !== 409)) {
          throw e;
        }
      }
    }

    if (existingNetwork) {
      return existingNetwork;
    }

    yield delay(1 * SECOND);
  }
}

export function* ensureNetworkDoesNotExist({ name }: NetworkRequest) {
  const client = new Compute();

  const routesClient = new Routes();

  let operation: any;
  let error: any = null;

  while (true) {
    const existingNetwork: boolean = yield call(doesNetworkExist, client, {
      name
    });

    if (!existingNetwork) {
      return;
    }
    if (error) {
      throw error;
    }
    if (operation) {
      yield delay(1 * SECOND);

      continue;
    }

    // Provide GCP time to remove routes related to subnet
    yield delay(20 * SECOND);

    try {
      // Destroy routes first
      const routes = yield call(getRoutes, routesClient, name);

      for (let r = 0; r < routes.length; r++) {
        log.info(`Destroying route: ${routes[r].name}`);
        yield call(destroyRoute, routesClient, routes[r].name);
      }
      if (routes.length) {
        yield delay(5 * SECOND);

        continue;
      }

      // Destroy network
      operation = yield call(destroyNetwork, client, name);
      operation.on("complete", (metadata: any) => {
        // The operation is complete.
        operation.removeAllListeners();
        operation = null;
        log.info(
          `VPC deletion is: ${metadata.status} with ${metadata.progress} progress`
        );
      });
      //-
      // You can register a listener to monitor when the operation begins running.
      //-
      operation.on("running", (metadata: any) => {
        // The operation is running.
        log.info(`VPC deletion has started with status: ${metadata.status}`);
      });
      //-
      // Be sure to register an error handler as well to catch any issues which
      // impeded the operation.
      //-
      operation.on("error", (err: any) => {
        // An error occurred during the operation.
        operation.removeAllListeners();
        operation = null;
        error = err;
      });
    } catch (e) {
      if (!e.code || (e.code && e.code !== 404)) {
        throw e;
      }
    }
  }
}