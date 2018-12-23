import React, { Component } from 'react';
import { Table, Button } from 'antd';
class TodoPlan extends Component {
    
    state = {
        columns: [{
          title: '创建时间',
          dataIndex: 'creatime',
          key: 'creatime',
        }, {
          title: '任务名称',
          dataIndex: 'name',
          key: 'name',
        }, {
          title: '任务状态',
          dataIndex: 'status',
          key: 'status',
          render: status => {
            // console.log(status);
            var statusList = ["已完成","进行中", "超时", "封存"];
            return (
              <span>{statusList[status]}</span>
            )
          }
        }, {
          title: '详情',
          key: 'describe',
          dataIndex: 'describe',
        }, {
          title: '操作',
          key: 'action',
          render: (text, record) => (
            <span>
              <Button type="primary" className="m-2">完成</Button>
              <Button type="primary" className="m-2">封存</Button>
              <Button type="primary" className="m-2">删除</Button>
            </span>
          ),
        }],
        data: null
      }
  
      componentDidMount() {
        fetch('https://easy-mock.com/mock/5b8baba761840c7b4033654b/todo/task',{
          method: 'GET'
        }).then( res => res.json())
        .then( data => {
          if(data.code === 1) {
            this.setState({
              data: data.data
            })
          }
        })
        
      }
  
      render () {
          return (
              <Table rowKey="id" columns={this.state.columns} dataSource={this.state.data} />
          )
      }
}
export default TodoPlan;