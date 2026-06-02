import { useEffect, useState } from "react";
import axios from "axios";

function ViewQuestions() {

  const [questions, setQuestions] = useState([]);

  useEffect(() => {
    fetchQuestions();
  }, []);

  const fetchQuestions = async () => {
    try {

      const res = await axios.get(
        "https://mcqtestportal-production.up.railway.app/api/questions/all"
      );

      setQuestions(res.data);

    } catch (err) {
      console.log(err);
    }
  };

  return (
    <div style={{ padding: "40px" }}>

      <h1>All Questions</h1>

      {questions.map((q, index) => (

        <div
          key={index}
          style={{
            border: "1px solid black",
            padding: "20px",
            marginBottom: "20px",
          }}
        >

          <h3>
            {index + 1}. {q.question}
          </h3>

          {q.options.map((option, i) => (

            <p key={i}>
              {option}
            </p>

          ))}

          <b>
            Correct Answer: {q.correctAnswer}
          </b>

        </div>

      ))}

    </div>
  );
}

export default ViewQuestions;