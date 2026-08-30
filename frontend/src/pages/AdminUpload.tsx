import NewDocDropzone from "../components/NewDocDropzone";
import AdminSteps from "../components/AdminSteps";
import BackToDocs from "../components/BackToDocs";

export default function AdminUpload() {
  return (
    <div className="app">
      <BackToDocs />
      <AdminSteps current={1} />
      <NewDocDropzone />
    </div>
  );
}
