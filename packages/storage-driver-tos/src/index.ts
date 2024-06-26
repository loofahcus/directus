import { MetadataDirectiveType, TosClient } from '@volcengine/tos-sdk';
import type { Driver, Range } from '@directus/storage';
import { normalizePath } from '@directus/utils';
import { isReadableStream } from '@directus/utils/node';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import type { TOSConstructorOptions } from '@volcengine/tos-sdk/dist/methods/base.js';
import type { GetObjectV2Input } from '@volcengine/tos-sdk/dist/methods/object/getObject.js';
import type { ListObjectsType2Input } from '@volcengine/tos-sdk/dist/methods/object/listObjectsType2.js';

export type DriverTosConfig = {
	root?: string;
	key?: string;
	secret?: string;
	bucket: string;
	endpoint?: string;
	region?: string;
};


export class DriverTos implements Driver {
	private config: DriverTosConfig;
	private client: TosClient;
	private root: string;

	constructor(config: DriverTosConfig) {
		this.config = config;
		this.client = this.getClient();
		this.root = this.config.root ? normalizePath(this.config.root, { removeLeading: true }) : '';
	}

	private getClient() {
		const tosClientConfig: TOSConstructorOptions = {
			accessKeyId: this.config.key || process.env["TOS_ACCESS_KEY"] || "",
			accessKeySecret: this.config.secret || process.env["TOS_SECRET_KEY"] || "",
			region: this.config.region || "cn-shanghai",
			endpoint: this.config.endpoint || "https://tos-cn-shanghai.ivolces.com",
		};

		return new TosClient(tosClientConfig);
	}

	private fullPath(filepath: string) {
		return normalizePath(join(this.root, filepath));
	}

	async read(filepath: string, range?: Range): Promise<Readable> {
		const commandInput: GetObjectV2Input = {
			key: this.fullPath(filepath),
			bucket: this.config.bucket,
		};

		if (range) {
			commandInput.range = `bytes=${range.start ?? ''}-${range.end ?? ''}`;
		}

		const { data: { content }, } = await this.client.getObjectV2(commandInput)

		if (!content || !isReadableStream(content)) {
			throw new Error(`No stream returned for file "${filepath}"`);
		}

		return content as Readable;
	}

	async stat(filepath: string) {
		const {data} = await this.client.headObject(
			{
				key: this.fullPath(filepath),
				bucket: this.config.bucket,
			}
		);

		
		return {
			size: Number(data['content-length']) as number,
			modified: new Date(data['last-modified']) as Date,
		};
	}

	async exists(filepath: string) {
		try {
			await this.stat(filepath);
			return true;
		} catch {
			return false;
		}
	}

	async move(src: string, dest: string) {
		await this.copy(src, dest);
		await this.delete(src);
	}

	async copy(src: string, dest: string) {
		const params = {
			key: this.fullPath(dest),
			bucket: this.config.bucket,
			srcBucket: this.config.bucket,
			srcKey: this.fullPath(src),
			metadataDirective: MetadataDirectiveType.MetadataDirectiveCopy,
		};

		await this.client.copyObject(params)
	}

	async write(filepath: string, content: Readable, type?: string) {
		const params = {
			bucket: this.config.bucket,
			key: this.fullPath(filepath),
			body: content,
		};

		await this.client.putObject(params)
	}

	async delete(filepath: string) {
		await this.client.deleteObject(
			{
				key: this.fullPath(filepath),
				bucket: this.config.bucket,
			}
		);
	}

	async *list(prefix = '') {
		let Prefix = this.fullPath(prefix);

		// Current dir (`.`) isn't known to S3, needs to be an empty prefix instead
		if (Prefix === '.') Prefix = '';

		let continuationToken: string | undefined = undefined;

		do {
			const listObjectsV2CommandInput: ListObjectsType2Input = {
				bucket: this.config.bucket,
				prefix,
				maxKeys: 1000,
			};

			if (continuationToken) {
				listObjectsV2CommandInput.continuationToken = continuationToken;
			}

			const { data } = await this.client.listObjectsType2(listObjectsV2CommandInput);

			continuationToken = data.NextContinuationToken;

			if (data.Contents) {
				for (const object of data.Contents) {
					if (!object.Key) continue;

					const isDir = object.Key.endsWith('/');

					if (isDir) continue;

					yield object.Key.substring(this.root.length);
				}
			}
		} while (continuationToken);
	}
}

export default DriverTos;
