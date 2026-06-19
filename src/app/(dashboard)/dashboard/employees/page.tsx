import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';

import { EmployeesManager } from '../settings/EmployeesManager';
import { getEmployees, getServiceAssignments, getTopEmployees } from '../settings/employee-actions';
import { ServiceEmployeesManager } from './ServiceEmployeesManager';
import { TopEmployees } from './TopEmployees';

export default async function EmployeesPage() {
  const team = await getEmployees();
  const assignments = await getServiceAssignments();
  const topEmployees = await getTopEmployees();

  if (!team.ok) {
    return (
      <div className="flex flex-col gap-6">
        <Notice role="alert" variant="error">
          {team.message}
        </Notice>
      </div>
    );
  }

  const showServiceAssignment = team.employees.length > 0 && assignments.ok;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-stretch">
        <Card
          as="section"
          className="border border-[var(--color-border-vychozi)] p-[var(--card-padding)] lg:col-span-2"
        >
          <EmployeesManager initialEmployees={team.employees} initialSettings={team.settings} />
        </Card>

        {topEmployees.ok ? (
          <div className="relative">
            <div className="lg:absolute lg:inset-0">
              <TopEmployees employees={topEmployees.employees} />
            </div>
          </div>
        ) : null}
      </div>

      {showServiceAssignment ? (
        <Card
          as="section"
          className="border border-[var(--color-border-vychozi)] p-[var(--card-padding)]"
        >
          <ServiceEmployeesManager
            services={assignments.services}
            employees={team.employees.map((e) => ({ id: e.id, name: e.name }))}
          />
        </Card>
      ) : null}
    </div>
  );
}
