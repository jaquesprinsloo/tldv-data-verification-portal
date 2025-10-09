import EmployeeSubmissionForm from "@/components/employee/EmployeeSubmissionForm";
import TLDVHeader from "@/components/employee/TLDVHeader";

const EmployeeDashboard = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      <TLDVHeader />
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
        <EmployeeSubmissionForm />
      </div>
    </div>
  );
};

export default EmployeeDashboard;
