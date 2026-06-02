import GoogleTranslate from "react-google-translate";

function Translator() {

  return (

    <div
      style={{
        position: "fixed",
        top: "20px",
        left: "20px",
        zIndex: 999999,
        background: "white",
        padding: "10px 14px",
        borderRadius: "12px",
        boxShadow: "0 4px 15px rgba(0,0,0,0.12)",
      }}
    >

      <GoogleTranslate
        languages={["en", "hi", "mr"]}
      />

    </div>
  );
}

export default Translator;