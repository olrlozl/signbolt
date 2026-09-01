import NewDocDropzone from "../components/NewDocDropzone";
import DocSteps from "../components/DocSteps";
import BackToDocs from "../components/BackToDocs";

export default function AdminUpload() {
  return (
    <div className="app">
      <BackToDocs />
      <DocSteps current={1} />
      <NewDocDropzone />
    </div>
  );
}
