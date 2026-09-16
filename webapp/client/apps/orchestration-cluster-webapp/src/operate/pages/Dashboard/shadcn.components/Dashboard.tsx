/*
 * Copyright Camunda Services GmbH and/or licensed to Camunda Services GmbH under
 * one or more contributor license agreements. See the NOTICE file distributed
 * with this work for additional information regarding copyright ownership.
 * Licensed under the Camunda License 1.0. You may not use this file
 * except in compliance with the Camunda License 1.0.
 */

import {useTranslation} from 'react-i18next';
import {DataTable, PageLayout, type DataTableColumn} from '@camunda/design-system';
import {cn} from '#/shared/cn';
import {useRunningInstancesCount} from '../useRunningInstancesCount';
import {NoInstancesEmptyState} from './NoInstancesEmptyState';
import {MetricPanel} from '../MetricPanel/shadcn.components/MetricPanel';
import {InstancesByProcess} from '../InstancesByProcess/shadcn.components/InstancesByProcess';
import {IncidentsByError} from '../IncidentsByError/shadcn.components/IncidentsByError';

type SnapshotOnlyRow = {id: string; name: string};

// InstancesByProcess and IncidentsByError now both render their own data. This placeholder
// column is only needed for the no-instances DataTable's loading skeleton — a DataTable with
// zero columns collapses to no height, so it needs at least one cell to paint into.
const snapshotOnlyColumns = (header: string): DataTableColumn<SnapshotOnlyRow>[] => [
	{id: 'name', header, cell: ({row}) => row.original.name},
];

const Dashboard: React.FC = () => {
	const {t} = useTranslation();
	const {data: count} = useRunningInstancesCount();
	const hasNoInstances = count.total === 0;

	return (
		<PageLayout tabIndex={-1} padding="none" width="full" className="h-full">
			<div className="flex h-full min-h-0 flex-1 flex-col gap-4 overflow-hidden px-6 py-4">
				<h1 className="sr-only">{t('operate.dashboard.title')}</h1>
				<div data-testid="metric-panel">
					<MetricPanel count={count} />
				</div>
				<div className="h-4 shrink-0" aria-hidden="true" />
				<div className={cn('grid flex-1 gap-4 overflow-hidden', !hasNoInstances && 'grid-cols-2')}>
					{hasNoInstances ? (
						// InstancesByProcess fetches nothing when there are no instances, so the empty
						// state replaces it outright rather than rendering an empty list.
						<DataTable
							aria-label={t('operate.dashboard.processesByNameTitle')}
							columns={snapshotOnlyColumns(t('operate.dashboard.processesByNameTitle'))}
							data={[]}
							getRowId={(row) => row.id}
							emptyState={<NoInstancesEmptyState />}
							className="flex flex-col overflow-hidden"
						/>
					) : (
						<InstancesByProcess />
					)}
					{!hasNoInstances && <IncidentsByError />}
				</div>
			</div>
		</PageLayout>
	);
};

export {Dashboard};
