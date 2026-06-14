import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';

import { EmployeesManager } from '../settings/EmployeesManager';
import { getEmployees, getServiceAssignments } from '../settings/employee-actions';
import { ServiceEmployeesManager } from './ServiceEmployeesManager';

export default async function EmployeesPage() {
  const team = await getEmployees();
  const assignments = await getServiceAssignments();

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
      <Card
        as="section"
        className="border border-[var(--color-border-vychozi)] p-[var(--card-padding)]"
      >
        <EmployeesManager initialEmployees={team.employees} initialSettings={team.settings} />
      </Card>

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
