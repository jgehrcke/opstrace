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

import * as fs from "fs";

import qs from "qs";
import axios, { AxiosRequestConfig } from "axios";
import open from "open";

import { log } from "@opstrace/utils";

const accessTokenFile = "./access.jwt";
const idTokenFile = "./id.jwt";

const issuer = "https://opstrace-dev.us.auth0.com";
const url = "https://dns-api.opstrace.net/dns/";
const client_id = "fT9EPILybLT44hQl2xE7hK0eTuH1sb21";

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

export class DNSClient {
  accessToken: string;
  idToken: string;
  headers: { [key: string]: string };

  private static instance: DNSClient;

  private constructor() {
    this.headers = {
      "content-type": "application/json"
    };
    this.accessToken = "";
    if (fs.existsSync(accessTokenFile)) {
      this.accessToken = fs.readFileSync(accessTokenFile, {
        encoding: "utf8",
        flag: "r"
      });
      this.headers["authorization"] = `Bearer ${this.accessToken}`;
    }
    this.idToken = "";
    if (fs.existsSync(idTokenFile)) {
      this.idToken = fs.readFileSync(idTokenFile, {
        encoding: "utf8",
        flag: "r"
      });
      this.headers["x-opstrace-id-token"] = this.idToken;
    }
  }

  public static async getInstance(): Promise<DNSClient> {
    if (!DNSClient.instance) {
      DNSClient.instance = new DNSClient();
    }

    if (DNSClient.instance.accessToken === "") {
      await DNSClient.instance.Login();
    }
    return Promise.resolve(DNSClient.instance);
  }

  public async Login() {
    if (this.accessToken !== "") {
      return;
    }
    const deviceCodeRequest: AxiosRequestConfig = {
      method: "POST",
      url: `${issuer}/oauth/device/code`,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      data: qs.stringify({
        client_id,
        scope: "profile email openid",
        audience: url
      })
    };

    const res = await axios.request(deviceCodeRequest);
    const verification_uri = res.data["verification_uri_complete"];
    console.log(
      `Opening browser to sign in in 5 seconds. If it does not open, follow this url: ${verification_uri}`
    );
    console.log(`Verification code: ${res.data["user_code"]}`);
    for (const _ in [1, 2, 3, 4, 5]) {
      await delay(1000);
      process.stderr.write(".");
    }
    open(verification_uri);
    while (true) {
      await delay(res.data["interval"] * 1000);
      const tokenRequest: AxiosRequestConfig = {
        method: "POST",
        url: `${issuer}/oauth/token`,
        headers: { "content-type": "application/x-www-form-urlencoded" },
        data: qs.stringify({
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          device_code: res.data["device_code"],
          client_id
        })
      };
      try {
        const r = await axios.request(tokenRequest);
        this.accessToken = r.data["access_token"];
        this.idToken = r.data["id_token"];
        this.headers["authorization"] = `Bearer ${this.accessToken}`;
        fs.writeFileSync(accessTokenFile, this.accessToken, {
          encoding: "utf-8"
        });
        this.headers["x-opstrace-id-token"] = this.idToken;
        fs.writeFileSync(idTokenFile, this.idToken, { encoding: "utf-8" });
        break;
      } catch (error) {
        if (error.response.data["error"] === "authorization_pending") {
          process.stderr.write(".");
          continue;
        }
        console.log(error.response.data["error_description"]);
      }
    }
    process.stderr.write("\n");
  }

  public async GetAll(): Promise<string[]> {
    log.debug("DNSClient.GetAll()");
    const getRequest: AxiosRequestConfig = {
      method: "GET",
      url,
      headers: this.headers
    };
    const r = await axios.request(getRequest);
    return r.data;
  }

  public async Delete(clustername: string): Promise<any> {
    log.debug("DNSClient.Delete()");
    const deleteRequest: AxiosRequestConfig = {
      method: "DELETE",
      url,
      headers: this.headers,
      data: {
        clustername
      }
    };
    return axios.request(deleteRequest);
  }

  public async Create(clustername: string): Promise<any> {
    log.debug("DNSClient.Create()");
    const createRequest: AxiosRequestConfig = {
      method: "POST",
      url,
      headers: this.headers,
      data: {
        clustername
      }
    };
    return axios.request(createRequest);
  }

  public async AddNameservers(
    clustername: string,
    nameservers: string[]
  ): Promise<any> {
    log.debug("DNSClient.AddNameservers()");
    const updateRequest: AxiosRequestConfig = {
      method: "PUT",
      url,
      headers: this.headers,
      data: {
        clustername,
        nameservers
      }
    };
    return axios.request(updateRequest);
  }
}
